from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import asyncpraw
import os
import concurrent.futures
import nest_asyncio

from reddit_analysis import load_and_prepare_reddit_df, add_sentiment_scores, add_bias_scores
from model_loader import download_model_from_gcs

# Allow nested event loops (needed for notebooks or other async contexts)
nest_asyncio.apply()

bias_model_path = None  # will be filled on request

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
        # Load bias model if not already cached
        global bias_model_path
        if not bias_model_path:
            bias_model_path = download_model_from_gcs("bias_model")
        df = add_bias_scores(df, model_path=bias_model_path)
        result = df.to_dict(orient='records')
        return jsonify({"status": "success", "data": result}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/')
def root():
    """Basic health check route for server."""
    return 'Reddit Extension Backend is Live!'

@app.route('/test-model-download')
def test_model_download():
    """Check if model files were downloaded from GCS."""
    global bias_model_path
    try:
        if not bias_model_path:
            bias_model_path = download_model_from_gcs("bias_model")
        if os.path.exists(bias_model_path):
            files = os.listdir(bias_model_path)
            return jsonify({"status": "success", "model_files": files}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

    return jsonify({"status": "error", "message": "Model path missing or invalid"}), 500

@app.route('/test-bias', methods=['GET'])
def test_bias():
    """
    Minimal test route to verify that the bias model loads and returns a prediction.
    """
    global bias_model_path
    if not bias_model_path or not os.path.exists(bias_model_path):
        return jsonify({'error': 'Bias model not loaded or missing'}), 500

    try:
        from reddit_analysis import add_bias_scores
        import pandas as pd

        test_text = "I hate you"
        df = pd.DataFrame({'body': [test_text]})
        df = add_bias_scores(df, model_path=bias_model_path)
        prediction = df['bias_label'].iloc[0] if 'bias_label' in df else 'unknown'

        return jsonify({'input': test_text, 'predicted_bias_label': prediction})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Start Flask server with dynamic or fallback port
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)))
