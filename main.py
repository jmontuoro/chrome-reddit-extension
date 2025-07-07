from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import asyncpraw
import os
import concurrent.futures

from reddit_analysis import load_and_prepare_reddit_df, add_sentiment_scores

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

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    try:
        task = asyncio.wait_for(load_and_prepare_reddit_df(url, reddit), timeout=15)
        df = loop.run_until_complete(task)
        df = add_sentiment_scores(df)
        result = df[['id', 'body', 'sentiment', 'sentiment_label']].to_dict(orient='records')
        return jsonify({"status": "success", "data": result}), 200
    except asyncio.TimeoutError:
        return jsonify({"status": "error", "message": "Request timed out"}), 504
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        loop.close()

@app.route('/')
def root():
    return 'Reddit Extension Backend is Live!'

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)))
