# model_loader.py

import os
from google.cloud import storage

def download_model_from_gcs(
    model_name: str,
    bucket: str = "reddit-bias-model",
    gcs_prefix: str = "bias_model/model_t2835ru3",
    destination: str = "/tmp"
):
    model_dir = os.path.join(destination, model_name)
    os.makedirs(model_dir, exist_ok=True)

    client = storage.Client()
    bucket = client.bucket(bucket)

    required_files = [
        "config.json",
        "model.safetensors",
        "special_tokens_map.json",
        "tokenizer.json",
        "tokenizer_config.json",
        "vocab.txt"
    ]

    for filename in required_files:
        local_path = os.path.join(model_dir, filename)
        if not os.path.exists(local_path):
            blob_path = f"{gcs_prefix}/{filename}"
            blob = bucket.blob(blob_path)
            blob.download_to_filename(local_path)
            print(f"✅ Downloaded {blob_path} → {local_path}")
        else:
            print(f"📦 Using cached: {filename}")

    return model_dir  # allows caller to load from correct path
