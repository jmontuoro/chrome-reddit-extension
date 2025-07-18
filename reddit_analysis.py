import pandas as pd
import asyncio
import asyncpraw
from nltk.sentiment import SentimentIntensityAnalyzer
import nltk

# Download the VADER lexicon once
nltk.download('vader_lexicon', quiet=True)
sia = SentimentIntensityAnalyzer()

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

async def load_and_prepare_reddit_df(url: str, reddit_client=None):
    if reddit_client is None:
        raise ValueError("Reddit client must be provided.")

    submission = await reddit_client.submission(url=url)
    await submission.load()
    submission.comment_sort = "best"
    await submission.comments.replace_more(limit=None)

    flat_comments = flatten_comments(submission.comments)
    original_post_info = extract_submission_metadata(submission)
    flat_comments.insert(0, original_post_info)

    df = pd.DataFrame(flat_comments)

    # Grouping comments into threads based on original comment (OC)
    df['oc_bin_id'] = None
    current_bin = None
    for idx, row in df.iterrows():
        if row['level'] == 0:
            current_bin = row['id']
        df.at[idx, 'oc_bin_id'] = current_bin
    print(df.columns)
    print(df.head(1).to_dict(orient="records"))

    return df

def add_sentiment_scores(df):
    df['sentiment'] = df['body'].apply(
        lambda text: sia.polarity_scores(str(text))['compound']
    )
    df['sentiment_label'] = df['sentiment'].apply(
        lambda s: 'positive' if s >= 0.05 else 'negative' if s <= -0.05 else 'neutral'
    )
    return df

def add_bias_scores(df):
    """
    Uses a HateBERT-based model to assign a social bias label to each Reddit comment.

    This function is intended to be implemented by Maria using a pretrained or fine-tuned 
    transformer model (such as HateBERT) to identify types of bias present in comment text.
    It operates similarly to `add_sentiment_scores`, appending a new `bias_label` column to 
    the input DataFrame.

    The labels should reflect **categories of social bias**, such as:
    - "racial", "gender", "religious", "none", or other custom classes defined by the model.

    Parameters:
    df (pd.DataFrame): DataFrame containing Reddit submission and comment data.
                       Must include a `body` column with raw text.

    Implementation Notes:
    - Output labels should be inserted as a new column: `bias_label`.

    Example template:
    >>> from transformers import pipeline
    >>> classifier = pipeline("text-classification", model="your-model-name", device=0)
    >>> def add_bias_scores(df):
    >>>     df['bias_label'] = df['body'].apply(lambda text: classifier(text)[0]['label'])
    >>>     return df

    Returns:
    pd.DataFrame: The same DataFrame with an additional `bias_label` column.
    """
    df['bias_label'] = df['body'].apply('YOUR CLASSIFIER HERE')
    return None
