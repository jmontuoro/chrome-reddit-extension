from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import asyncpraw
import os
import concurrent.futures
import nest_asyncio

from reddit_analysis import load_and_prepare_reddit_df, add_sentiment_scores, add_bias_scores

# Allow nested event loops (needed for notebooks or other async contexts)
nest_asyncio.apply()

app = Flask(__name__)
CORS(app, origins=["chrome-extension://gddciniaajmhfjcabblkceekjjlenko"])  # Enable Cross-Origin Resource Sharing for local frontend use

# Set up Reddit client from environment variables
reddit = asyncpraw.Reddit(
    client_id=os.getenv("REDDIT_CLIENT_ID"),
    client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
    user_agent=os.getenv("REDDIT_USER_AGENT")
)

@app.route('/receive_url', methods=['POST'])
def receive_url():
    """
    Flask route to receive a Reddit thread URL via POST request,
    scrape comments and metadata using AsyncPRAW, compute sentiment,
    and return a list of processed comments.

    Request JSON:
        {
            "url": "<Reddit thread URL>"
        }

    Response JSON:
        {
            "status": "success",
            "data": [ ... list of comments with sentiment ... ]
        }
        or
        {
            "status": "error",
            "message": "<error message>"
        }
    """
    data = request.get_json()
    url = data.get('url')

    try:
        loop = asyncio.get_event_loop()
        df = loop.run_until_complete(load_and_prepare_reddit_df(url, reddit))
        df = add_sentiment_scores(df)
        df = add_bias_scores(df)
        result = df.to_dict(orient='records')
        return jsonify({"status": "success", "data": result}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/')
def root():
    """Basic health check route for server."""
    return 'Reddit Extension Backend is Live!'

if __name__ == '__main__':
    # Start Flask server with dynamic or fallback port
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)))
