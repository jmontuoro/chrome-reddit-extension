import pandas as pd
import asyncio
import asyncpraw
import nltk
import torch

from nltk.sentiment import SentimentIntensityAnalyzer
from transformers import BertTokenizer, BertForSequenceClassification

# Path to where model files are stored (downloaded from GCS)
_model_path = "/tmp/bias_model"

# Lazy-loading variables
_tokenizer = None
_model = None

# Map label IDs to strings
id2label = {
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

def load_bias_model():
    """Load the bias model and tokenizer from local disk, only once."""
    global _tokenizer, _model
    if _tokenizer is None or _model is None:
        _tokenizer = BertTokenizer.from_pretrained(_model_path, local_files_only=True)
        _model = BertForSequenceClassification.from_pretrained(_model_path, local_files_only=True)
        _model.eval()
        print("✅ Bias model and tokenizer loaded.")

def flatten_comments(comment_forest, level=0):
    flat_list = []
    for comment in comment_forest:
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
    return flat_list

def extract_submission_metadata(submission, level=0):
    return {
        "id": submission.id,
        "parent_id": "",
        "author": str(submission.author),
        "body": submission.selftext if submission.selftext else submission.title,
        "score": submission.score,
        "created_utc": submission.created_utc,
        "level": level,
    }

async def load_and_prepare_reddit_df(url: str, reddit_client=None, max_comments=500):
    if reddit_client is None:
        raise ValueError("Reddit client must be provided.")

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

    return df

def add_sentiment_scores(df):
    df['sentiment'] = df['body'].apply(
        lambda text: sia.polarity_scores(str(text))['compound']
    )
    df['sentiment_label'] = df['sentiment'].apply(
        lambda s: 'positive' if s >= 0.05 else 'negative' if s <= -0.05 else 'neutral'
    )
    return df

def test_bias_prediction(text):
    """Run a test prediction to confirm model is working."""
    load_bias_model()
    inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        logits = _model(**inputs).logits
        probs = torch.softmax(logits, dim=1).squeeze().tolist()
        return {id2label[i]: round(prob, 4) for i, prob in enumerate(probs)}


def add_bias_scores(df, model_path="/tmp/bias_model"):
    """
    Add multi-label bias predictions to each comment using the downloaded model.
    Each row will contain a dictionary of label probabilities.
    """
    tokenizer = BertTokenizer.from_pretrained(model_path, local_files_only=True)
    model = BertForSequenceClassification.from_pretrained(model_path, local_files_only=True)
    model.eval()

    def predict_bias(text):
        inputs = tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            logits = model(**inputs).logits
            probs = torch.softmax(logits, dim=1).squeeze().tolist()
            return {id2label[i]: round(prob, 4) for i, prob in enumerate(probs)}

    df['bias'] = df['body'].apply(predict_bias)
    return df

