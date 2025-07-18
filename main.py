from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import asyncpraw
import os
import concurrent.futures
import nest_asyncio
nest_asyncio.apply()

from reddit_analysis import load_and_prepare_reddit_df, add_sentiment_scores, add_bias_scores

app = Flask(__name__)
CORS(app)

# Set up Reddit client from environment variables
reddit = asyncpraw.Reddit(
    client_id=os.getenv("REDDIT_CLIENT_ID"),
    client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
    user_agent=os.getenv("REDDIT_USER_AGENT")
)

@app.route('/receive_url', methods=['POST'])
def receive_url():
    data = request.get_json()
    url = data.get('url')
    print("Received URL:", url)

    try:
        loop = asyncio.get_event_loop()
        df = loop.run_until_complete(load_and_prepare_reddit_df(url, reddit))
        df = add_sentiment_scores(df)
        df = add_bias_scores(df)
        
        result = df.to_dict(orient='records')
        
        return jsonify({
            "status": "success",
            "data": {
                "sentiment_data": result,
                "bias_data": result  # frontend will pull either label
            }
        }), 200
    except Exception as e:
        print("Error:", str(e))
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/')
def root():
    return 'Reddit Extension Backend is Live!'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)))
