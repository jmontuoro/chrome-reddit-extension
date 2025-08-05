import os
import logging
from google.cloud import storage

logger = logging.getLogger(__name__)

# Required model and tokenizer files - made configurable
DEFAULT_MODEL_FILES = [
    "config.json",
    "model.safetensors",
    "special_tokens_map.json", 
    "tokenizer.json",
    "tokenizer_config.json",
    "vocab.txt"
]

def download_model_from_gcs(
    model_name: str,
    bucket: str = "reddit-bias-model",
    gcs_prefix: str = "bias_model/model_t2835ru3",
    destination: str = "/tmp",
    required_files: list = None,
    verbose: bool = True
) -> str:
    """
    Downloads model files from Google Cloud Storage to local directory.
    
    Args:
        model_name: Name of the model directory to create
        bucket: GCS bucket name
        gcs_prefix: Prefix path in GCS bucket
        destination: Local destination directory
        required_files: List of required files (uses DEFAULT_MODEL_FILES if None)
        verbose: Whether to log download progress
        
    Returns:
        str: Path to local model directory
        
    Raises:
        Exception: If download fails or files are missing
    """
    if required_files is None:
        required_files = DEFAULT_MODEL_FILES
    
    # Local directory to save model files
    model_dir = os.path.join(destination, model_name)
    os.makedirs(model_dir, exist_ok=True)
    
    try:
        client = storage.Client()
        gcs_bucket = client.bucket(bucket)
        
        # Track which files need downloading
        files_to_download = []
        for filename in required_files:
            local_path = os.path.join(model_dir, filename)
            if not os.path.exists(local_path):
                files_to_download.append(filename)
            elif verbose:
                logger.info(f"Using cached: {filename}")
        
        # Download missing files
        if files_to_download:
            logger.info(f"Downloading {len(files_to_download)} missing files...")
            
            for filename in files_to_download:
                local_path = os.path.join(model_dir, filename)
                blob_path = f"{gcs_prefix}/{filename}"
                
                try:
                    blob = gcs_bucket.blob(blob_path)
                    blob.download_to_filename(local_path)
                    
                    # Verify file was downloaded and has content
                    if not os.path.exists(local_path) or os.path.getsize(local_path) == 0:
                        raise Exception(f"Downloaded file {filename} is empty or missing")
                    
                    if verbose:
                        file_size = os.path.getsize(local_path)
                        logger.info(f"Downloaded {blob_path} → {local_path} ({file_size} bytes)")
                        
                except Exception as e:
                    logger.error(f"Failed to download {blob_path}: {e}")
                    raise Exception(f"Failed to download {filename}: {e}")
        
        # Final verification - ensure all required files exist
        missing_files = [
            f for f in required_files 
            if not os.path.exists(os.path.join(model_dir, f))
        ]
        
        if missing_files:
            raise Exception(f"Missing required model files after download: {missing_files}")
        
        logger.info(f"Model files ready at: {model_dir}")
        return model_dir
        
    except Exception as e:
        logger.error(f"Model download failed: {e}")
        raise

def verify_model_files(model_dir: str, required_files: list = None) -> bool:
    """
    Verify that all required model files exist and are not empty.
    
    Args:
        model_dir: Directory containing model files
        required_files: List of required files (uses DEFAULT_MODEL_FILES if None)
        
    Returns:
        bool: True if all files exist and are not empty
    """
    if required_files is None:
        required_files = DEFAULT_MODEL_FILES
    
    if not os.path.exists(model_dir):
        logger.warning(f"Model directory does not exist: {model_dir}")
        return False
    
    for filename in required_files:
        file_path = os.path.join(model_dir, filename)
        if not os.path.exists(file_path):
            logger.warning(f"Missing model file: {filename}")
            return False
        if os.path.getsize(file_path) == 0:
            logger.warning(f"Empty model file: {filename}")
            return False
    
    return True