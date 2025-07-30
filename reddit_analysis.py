import os
import pandas as pd
import asyncio
import asyncpraw

#useless push to trigger build.

# Sentiment analysis
import nltk
from nltk.sentiment import SentimentIntensityAnalyzer

# Bias model & loading
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from safetensors.torch import load_file
from google.cloud import storage

# Globals for model caching
_model = None
_tokenizer = None
BIAS_LABELS = []

# Ensure VADER is ready
nltk.download('vader_lexicon', quiet=True)
sia = SentimentIntensityAnalyzer()


def download_model_from_gcs_if_needed():
    """
    Download the bias model from GCS if it's not already cached locally.

    Returns:
        str: Local file path to the model.
    """
    local_path = "/tmp/model.safetensors"
    if os.path.exists(local_path):
        return local_path

    print("[Bias] Downloading model from GCS...")
    bucket_name = "reddit-bias-model"
    blob_path = "model.safetensors"

    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(blob_path)
    blob.download_to_filename(local_path)

    print("[Bias] Download complete.")
    return local_path


async def load_and_prepare_reddit_df(url: str, reddit_client=None, max_comments=500):
    """
    Load and flatten a Reddit submission and its comments into a DataFrame.

    Args:
        url (str): The Reddit thread URL.
        reddit_client: An instance of asyncpraw.Reddit.
        max_comments (int): Max number of comments to keep.

    Returns:
        pd.DataFrame: Flattened comments with metadata.
    """
    if reddit_client is None:
        raise ValueError("Reddit client must be provided.")

    submission = await reddit_client.submission(url=url)
    await submission.load()
    submission.comment_sort = "best"
    await submission.comments.replace_more(limit=8)

    flat_comments = flatten_comments(submission.comments)[:max_comments]
    flat_comments.insert(0, extract_submission_metadata(submission))

    df = pd.DataFrame(flat_comments)

    # Group by original comment (OC) ID
    df['oc_bin_id'] = None
    current_bin = None
    for idx, row in df.iterrows():
        if row['level'] == 0:
            current_bin = row['id']
        df.at[idx, 'oc_bin_id'] = current_bin

    return df


def flatten_comments(comment_forest, level=0):
    """
    Recursively flatten nested comment structure.

    Args:
        comment_forest: List of comment objects.
        level (int): Nesting level (0 = top-level).

    Returns:
        list[dict]: Flattened comment data.
    """
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
    """
    Extract the root post (submission) data.

    Args:
        submission: asyncpraw submission object.
        level (int): Set to 0.

    Returns:
        dict: Submission metadata formatted like a comment.
    """
    return {
        "id": submission.id,
        "parent_id": "",
        "author": str(submission.author),
        "body": submission.selftext if submission.selftext else submission.title,
        "score": submission.score,
        "created_utc": submission.created_utc,
        "level": level,
    }


def add_sentiment_scores(df):
    """
    Add VADER sentiment scores and labels to the DataFrame.

    Args:
        df (pd.DataFrame): Reddit post/comments.

    Returns:
        pd.DataFrame: With 'sentiment' and 'sentiment_label' columns added.
    """
    df['sentiment'] = df['body'].apply(
        lambda text: sia.polarity_scores(str(text))['compound']
    )
    df['sentiment_label'] = df['sentiment'].apply(
        lambda s: 'positive' if s >= 0.05 else 'negative' if s <= -0.05 else 'neutral'
    )
    return df


def load_bias_model():
    """
    Load the tokenizer and model from disk (or download it if needed).
    """
    global _model, _tokenizer, BIAS_LABELS

    model_dir = "bias_model/model_t2835ru3"
    model_path = download_model_from_gcs_if_needed()

    if _model is None or _tokenizer is None:
        print("[Bias] Loading tokenizer and model...")
        _tokenizer = AutoTokenizer.from_pretrained(model_dir)
        config = AutoModelForSequenceClassification.from_pretrained(model_dir).config
        _model = AutoModelForSequenceClassification.from_config(config)
        load_file(model_path, _model)
        _model.eval()
        BIAS_LABELS = [v for k, v in sorted(config.id2label.items(), key=lambda x: int(k))]


def predict_bias_labels(text):
    """
    Predict bias scores for a single piece of text.

    Args:
        text (str): Input comment or post text.

    Returns:
        dict: Label → probability score.
    """
    global _model, _tokenizer, BIAS_LABELS

    if not isinstance(text, str) or text.strip() == "":
        return {label: 0.0 for label in BIAS_LABELS}

    inputs = _tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
    with torch.no_grad():
        outputs = _model(**inputs)
        logits = outputs.logits.squeeze()
        probs = torch.sigmoid(logits)

    return {label: round(score.item(), 3) for label, score in zip(BIAS_LABELS, probs)}


def add_bias_scores(df):
    """
    Add bias scores for each row in the DataFrame.

    Args:
        df (pd.DataFrame): Reddit post/comments.

    Returns:
        pd.DataFrame: With 1 column per bias label.
    """
    load_bias_model()
    print("[Bias] Running inference on dataframe...")
    bias_dicts = df["body"].apply(predict_bias_labels)
    bias_df = pd.DataFrame(list(bias_dicts))
    return pd.concat([df, bias_df], axis=1)
