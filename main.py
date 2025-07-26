#Generative AI Disclaimer:
''' This file contains portions of code and documentation assisted by generative AI (ChatGPT, Copilot),
particularly for converting Python functions. Notably, assistance was used in structuring async Reddit scraping.
All functionality was implemented, reviewed, and adapted by Jackson Montuoro. '''


from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import asyncpraw
import os
#import concurrent.futures
#import nest_asyncio

from reddit_analysis import load_and_prepare_reddit_df, add_sentiment_scores

# Allow nested event loops (needed for notebooks or other async contexts)
#nest_asyncio.apply()

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for local frontend use

# Set up Reddit client from environment variables
reddit = asyncpraw.Reddit(
    client_id=os.getenv("REDDIT_CLIENT_ID"),
    client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
    user_agent=os.getenv("REDDIT_USER_AGENT")
)

@app.route('/receive_url', methods=['POST'])
def receive_url():
    """
    Receives a Reddit thread URL, fetches and processes comment data with sentiment.
    """
    data = request.get_json()
    url = data.get('url')

    async def process_reddit(url):
        df = await load_and_prepare_reddit_df(url, reddit)
        return add_sentiment_scores(df)

    try:
        df = asyncio.run(process_reddit(url))
        result = df.to_dict(orient='records')
        return jsonify({"status": "success", "data": result}), 200
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/')
def root():
    """Basic health check route for server."""
    return 'Reddit Extension Backend is Live!'

if __name__ == '__main__':
    # Start Flask server with dynamic or fallback port
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)))
