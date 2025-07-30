from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import asyncio
import asyncpraw
import os
import concurrent.futures
import nest_asyncio

from reddit_analysis import load_and_prepare_reddit_df, add_sentiment_scores, add_bias_scores

# Allow nested event loops (needed for notebooks or async contexts)
nest_asyncio.apply()

app = Flask(__name__)

# Explicitly allow Chrome extension origin
EXTENSION_ORIGIN = "chrome-extension://gddciniaajmhfjcabblkceekjjlenko"
CORS(app, origins=[EXTENSION_ORIGIN], supports_credentials=True)

# Set up Reddit client from environment variables
reddit = asyncpraw.Reddit(
    client_id=os.getenv("REDDIT_CLIENT_ID"),
    client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
    user_agent=os.getenv("REDDIT_USER_AGENT")
)

@app.route('/receive_url', methods=['POST', 'OPTIONS'])
def receive_url():
    if request.method == 'OPTIONS':
        response = make_response()
        response.headers['Access-Control-Allow-Origin'] = EXTENSION_ORIGIN
        response.headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        response.headers['Access-Control-Max-Age'] = '3600'
        return response

    data = request.get_json()
    url = data.get('url')

    try:
        loop = asyncio.get_event_loop()
        df = loop.run_until_complete(load_and_prepare_reddit_df(url, reddit))
        df = add_sentiment_scores(df)
        df = add_bias_scores(df)
        result = df.to_dict(orient='records')

        response = jsonify({"status": "success", "data": result})
        response.headers['Access-Control-Allow-Origin'] = EXTENSION_ORIGIN
        return response, 200
    except Exception as e:
        response = jsonify({"status": "error", "message": str(e)})
        response.headers['Access-Control-Allow-Origin'] = EXTENSION_ORIGIN
        return response, 500

@app.route('/')
def root():
    return 'Reddit Extension Backend is Live!'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)))
