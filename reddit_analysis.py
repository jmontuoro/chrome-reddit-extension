import pandas as pd
import asyncio
import asyncpraw
import nltk
import torch
import logging

from nltk.sentiment import SentimentIntensityAnalyzer
from transformers import BertTokenizer, BertForSequenceClassification

logger = logging.getLogger(__name__)

# Global model cache - consolidated from multiple locations
_tokenizer = None
_model = None
_current_model_path = None

# Map label IDs to strings
ID2LABEL = {
    0: "None",
    1: "body",
    2: "culture", 
    3: "disabled",
    4: "gender",
    5: "race",
    6: "social",
    7: "victim"
}

# Download the VADER lexicon once
nltk.download('vader_lexicon', quiet=True)
sia = SentimentIntensityAnalyzer()

def load_bias_model(model_path):
    """Load the bias model and tokenizer from local disk - consolidated function."""
    global _tokenizer, _model, _current_model_path
    
    # Only reload if path changed or not loaded
    if _tokenizer is None or _model is None or _current_model_path != model_path:
        logger.info(f"Loading bias model from {model_path}")
        _tokenizer = BertTokenizer.from_pretrained(model_path, local_files_only=True)
        _model = BertForSequenceClassification.from_pretrained(model_path, local_files_only=True)
        _model.eval()
        _current_model_path = model_path
        logger.info("Bias model and tokenizer loaded successfully")
    
    return _model, _tokenizer

def flatten_comments(comment_forest, level=0):
    """Recursively flatten comment tree into list."""
    flat_list = []
    for comment in comment_forest:
        try:
            flat_list.append({
                "id": comment.id,
                "parent_id": comment.parent_id,
                "author": str(comment.author),
                "body": comment.body,
                "score": comment.score,
                "created_utc": comment.created_utc,
                "level": level,
            })
            if hasattr(comment, "replies"):
                flat_list.extend(flatten_comments(comment.replies, level=level + 1))
        except Exception as e:
            logger.warning(f"Failed to process comment: {e}")
            continue
    return flat_list

def extract_submission_metadata(submission, level=0):
    """Extract metadata from original submission."""
    return {
        "id": submission.id,
        "parent_id": "",
        "author": str(submission.author),
        "body": submission.selftext if submission.selftext else submission.title,
        "score": submission.score,
        "created_utc": submission.created_utc,
        "level": level,
    }

async def load_and_prepare_reddit_df(url: str, reddit_client=None, max_comments=2000):
    """Load Reddit data and prepare DataFrame."""
    if reddit_client is None:
        raise ValueError("Reddit client must be provided.")

    try:
        submission = await reddit_client.submission(url=url)
        await submission.load()
        submission.comment_sort = "best"
        await submission.comments.replace_more(limit=8)  # reduces depth - helpful for large threads

        # Step 1: Flatten all comments into a list of dicts
        flat_comments = flatten_comments(submission.comments)

        # Step 2: Heuristically take first N comments (already sorted by "best")
        flat_comments = flat_comments[:max_comments]

        # Step 3: Add the original post at the top
        original_post_info = extract_submission_metadata(submission)
        flat_comments.insert(0, original_post_info)

        # Step 4: Convert to DataFrame
        df = pd.DataFrame(flat_comments)

        # Step 5: Grouping comments into threads based on original comment (OC)
        df['oc_bin_id'] = None
        current_bin = None
        for idx, row in df.iterrows():
            if row['level'] == 0:
                current_bin = row['id']
            df.at[idx, 'oc_bin_id'] = current_bin

        logger.info(f"Loaded {len(df)} comments from Reddit thread")
        return df
        
    except Exception as e:
        logger.error(f"Failed to load Reddit data: {e}")
        raise

def add_sentiment_scores(df):
    """Add VADER sentiment scores to DataFrame."""
    try:
        df['sentiment'] = df['body'].apply(
            lambda text: sia.polarity_scores(str(text))['compound']
        )
        df['sentiment_label'] = df['sentiment'].apply(
            lambda s: 'positive' if s >= 0.05 else 'negative' if s <= -0.05 else 'neutral'
        )
        logger.info(f"Added sentiment scores to {len(df)} comments")
        return df
    except Exception as e:
        logger.error(f"Failed to add sentiment scores: {e}")
        raise

def predict_bias_single(text, model, tokenizer):
    """Predict bias for a single text - helper function."""
    try:
        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            logits = model(**inputs).logits
            probs = torch.softmax(logits, dim=1).squeeze().tolist()
            return {ID2LABEL[i]: round(prob, 4) for i, prob in enumerate(probs)}
    except Exception as e:
        logger.warning(f"Failed to predict bias for text: {e}")
        # Return neutral prediction on failure
        return {label: 0.0 for label in ID2LABEL.values()}

def add_bias_scores(df, model_path):
    """
    Add multi-label bias predictions to each comment using the loaded model.
    Each row will contain a dictionary of label probabilities.
    """
    try:
        # Load model using consolidated function
        model, tokenizer = load_bias_model(model_path)
        
        # Apply bias prediction to each comment
        df['bias'] = df['body'].apply(
            lambda text: predict_bias_single(str(text), model, tokenizer)
        )
        
        logger.info(f"Added bias scores to {len(df)} comments")
        return df
        
    except Exception as e:
        logger.error(f"Failed to add bias scores: {e}")
        raise

def test_bias_prediction(text, model_path):
    """Run a test prediction to confirm model is working - updated to use consolidated loading."""
    try:
        model, tokenizer = load_bias_model(model_path)
        return predict_bias_single(text, model, tokenizer)
    except Exception as e:
        logger.error(f"Test bias prediction failed: {e}")
        raise