from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
import asyncpraw
import os
import logging
import nest_asyncio

from reddit_analysis import load_and_prepare_reddit_df, add_sentiment_scores, add_bias_scores
from model_loader import download_model_from_gcs

#test push to gcp

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Allow nested event loops (needed for notebooks or other async contexts)
nest_asyncio.apply()

# Global model cache - loads once, reuses across requests
_bias_model_path = None

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing for local frontend use

def validate_environment():
    """Validate required environment variables on startup."""
    required_vars = ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_USER_AGENT']
    missing = [var for var in required_vars if not os.getenv(var)]
    if missing:
        raise ValueError(f"Missing required environment variables: {missing}")

def validate_reddit_url(url):
    """Basic validation for Reddit URLs."""
    if not url or not isinstance(url, str):
        return False
    return 'reddit.com' in url or 'redd.it' in url

def get_bias_model_path():
    """Get or load bias model path (cached globally)."""
    global _bias_model_path
    if not _bias_model_path:
        logger.info("Loading bias model from GCS...")
        _bias_model_path = download_model_from_gcs("bias_model")
        logger.info(f"Bias model loaded at: {_bias_model_path}")
    return _bias_model_path

# Validate environment on startup
validate_environment()

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
    try:
        # Validate input
        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({"status": "error", "message": "URL is required"}), 400
            
        url = data.get('url')
        if not validate_reddit_url(url):
            return jsonify({"status": "error", "message": "Invalid Reddit URL"}), 400

        # Process the request
        loop = asyncio.get_event_loop()
        df = loop.run_until_complete(load_and_prepare_reddit_df(url, reddit))
        df = add_sentiment_scores(df)
        
        # Get cached model path
        model_path = get_bias_model_path()
        df = add_bias_scores(df, model_path=model_path)
        
        result = df.to_dict(orient='records')
        logger.info(f"Successfully processed {len(result)} comments from URL")
        return jsonify({"status": "success", "data": result}), 200
        
    except ValueError as e:
        logger.warning(f"Validation error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400
    except Exception as e:
        logger.error(f"Error processing request: {e}")
        return jsonify({"status": "error", "message": "Failed to process Reddit thread"}), 500


@app.route('/')
def root():
    """Basic health check route for server."""
    return 'Reddit Extension Backend is Live!'

@app.route('/test-model-download')
def test_model_download():
    """Check if model files were downloaded from GCS."""
    try:
        model_path = get_bias_model_path()
        if os.path.exists(model_path):
            files = os.listdir(model_path)
            return jsonify({"status": "success", "model_files": files}), 200
        else:
            return jsonify({"status": "error", "message": "Model path missing"}), 500
    except Exception as e:
        logger.error(f"Model download test failed: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route('/test-bias', methods=['GET'])
def test_bias():
    """
    Test route to inspect raw logits and softmax probabilities from the bias model.
    """
    try:
        model_path = get_bias_model_path()
        if not os.path.exists(model_path):
            return jsonify({'error': 'Bias model not loaded or missing'}), 500

        import torch
        from transformers import BertTokenizer, BertForSequenceClassification
        import torch.nn.functional as F

        model = BertForSequenceClassification.from_pretrained(model_path, local_files_only=True)
        tokenizer = BertTokenizer.from_pretrained(model_path, local_files_only=True)
        model.eval()

        test_text = request.args.get('text', 'I hate you')
        inputs = tokenizer(test_text, return_tensors="pt", truncation=True, max_length=512)
        
        with torch.no_grad():
            logits = model(**inputs).logits
            probs = F.softmax(logits, dim=1).squeeze().tolist()
            label_id = torch.argmax(logits, dim=1).item()

        return jsonify({
            'input': test_text,
            'label_id': label_id,
            'logits': logits.squeeze().tolist(),
            'softmax_probs': probs
        })
    except Exception as e:
        logger.error(f"Bias test failed: {e}")
        return jsonify({'error': str(e)}), 500
        

# Add these new routes to your main.py

@app.route('/receive_url_fast', methods=['POST'])
def receive_url_fast():
    """
    Fast route that returns Reddit data with sentiment only.
    Bias analysis happens in separate endpoint.
    """
    try:
        # Validate input (same as before)
        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({"status": "error", "message": "URL is required"}), 400
            
        url = data.get('url')
        if not validate_reddit_url(url):
            return jsonify({"status": "error", "message": "Invalid Reddit URL"}), 400

        # Process Reddit data and sentiment (fast operations)
        loop = asyncio.get_event_loop()
        df = loop.run_until_complete(load_and_prepare_reddit_df(url, reddit))
        df = add_sentiment_scores(df)
        
        result = df.to_dict(orient='records')
        logger.info(f"Fast processing completed for {len(result)} comments")
        return jsonify({"status": "success", "data": result}), 200
        
    except Exception as e:
        logger.error(f"Error in fast processing: {e}")
        return jsonify({"status": "error", "message": "Failed to process Reddit thread"}), 500

@app.route('/add_bias_analysis', methods=['POST'])
def add_bias_analysis():
    """
    Separate route that adds bias analysis to existing comment data.
    Takes comment data and returns it with bias scores added.
    """
    try:
        data = request.get_json()
        if not data or 'comments' not in data:
            return jsonify({"status": "error", "message": "Comments data required"}), 400
        
        comments = data.get('comments')
        
        # Convert back to DataFrame for processing
        df = pd.DataFrame(comments)
        
        # Add bias analysis (slow operation)
        model_path = get_bias_model_path()
        df = add_bias_scores(df, model_path=model_path)
        
        result = df.to_dict(orient='records')
        logger.info(f"Bias analysis completed for {len(result)} comments")
        return jsonify({"status": "success", "data": result}), 200
        
    except Exception as e:
        logger.error(f"Error in bias analysis: {e}")
        return jsonify({"status": "error", "message": "Failed to analyze bias"}), 500

# Keep original endpoint for backward compatibility
@app.route('/receive_url', methods=['POST'])
def receive_url():
    """
    Original endpoint - now calls the new parallel approach internally
    """
    try:
        # Get fast sentiment data first
        sentiment_response = receive_url_fast()
        if sentiment_response[1] != 200:  # Check status code
            return sentiment_response
        
        sentiment_data = sentiment_response[0].get_json()['data']
        
        # Add bias analysis
        bias_response = add_bias_analysis()
        if bias_response[1] != 200:
            # Return sentiment data even if bias fails
            return jsonify({
                "status": "partial_success", 
                "data": sentiment_data,
                "message": "Sentiment analysis completed, bias analysis failed"
            }), 200
        
        return bias_response
        
    except Exception as e:
        logger.error(f"Error in combined processing: {e}")
        return jsonify({"status": "error", "message": "Failed to process request"}), 500

if __name__ == '__main__':
    # Start Flask server with dynamic or fallback port
    port = int(os.environ.get("PORT", 8080))
    logger.info(f"Starting server on port {port}")
    app.run(host='0.0.0.0', port=port)
