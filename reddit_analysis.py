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

async def load_and_prepare_reddit_df(url: str, reddit_client=None, max_comments=1000):
    if reddit_client is None:
        raise ValueError("Reddit client must be provided.")

    submission = await reddit_client.submission(url=url)
    await submission.load()
    submission.comment_sort = "best"
    await submission.comments.replace_more(limit=8) #reduces depth- helpful for large threads.

    # Step 1: Flatten all comments into a list of dicts
    flat_comments = flatten_comments(submission.comments)

    # Step 2: Score-aware subsampling if too large
    if len(flat_comments) > max_comments:
        flat_comments = random.choices(
            flat_comments,
            weights=[max(1, comment['score']) for comment in flat_comments],
            k=max_comments
        )

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
