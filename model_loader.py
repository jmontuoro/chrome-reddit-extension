import os
from google.cloud import storage

# Downloads model files from Google Cloud Storage to local /tmp directory
def download_model_from_gcs(
    model_name: str,
    bucket: str = "reddit-bias-model",
    gcs_prefix: str = "bias_model/model_t2835ru3",
    destination: str = "/tmp",
    verbose: bool = True
) -> str:
    # Local directory to save model files
    model_dir = os.path.join(destination, model_name)
    os.makedirs(model_dir, exist_ok=True)

    # Required model and tokenizer files
    required_files = [
        "config.json",
        "model.safetensors",
        "special_tokens_map.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "vocab.txt"
    ]

    client = storage.Client()
    gcs_bucket = client.bucket(bucket)

    # Download missing files only
    for filename in required_files:
        local_path = os.path.join(model_dir, filename)
        if not os.path.exists(local_path):
            blob_path = f"{gcs_prefix}/{filename}"
            blob = gcs_bucket.blob(blob_path)
            blob.download_to_filename(local_path)
            if verbose:
                print(f"Downloaded {blob_path} → {local_path}")
        elif verbose:
            print(f"Using cached: {filename}")

    return model_dir  # path to local model files
