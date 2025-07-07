from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import asyncpraw

from reddit_analysis import load_and_prepare_reddit_df, add_sentiment_scores

app = Flask(__name__)
CORS(app)

# Set up Reddit client
reddit = asyncpraw.Reddit(
    client_id="YOUR_CLIENT_ID",
    client_secret="YOUR_CLIENT_SECRET",
    user_agent="extract_post_by_u_waterupmynose"
)

@app.route('/receive_url', methods=['POST'])
def receive_url():
    data = request.get_json()
    url = data.get('url')
    print("Received URL:", url)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        df = loop.run_until_complete(load_and_prepare_reddit_df(url, reddit))
        df = add_sentiment_scores(df)
        result = df[['id', 'body', 'sentiment', 'sentiment_label']].to_dict(orient='records')
        return jsonify({"status": "success", "data": result}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/')
def root():
    return 'Reddit Extension Backend is Live!'

if __name__ == '__main__':
    app.run(debug=True)
