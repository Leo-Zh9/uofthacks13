#!/bin/bash
set -e

echo "=== Vertex AI GGUF Model Server ==="
echo "Model GCS URI: ${MODEL_GCS_URI:-'(not set, expecting local model)'}"
echo "Model Path: ${MODEL_PATH}"
echo "GPU Layers: ${N_GPU_LAYERS}"
echo "Context Size: ${N_CTX}"

# Download model from GCS if URI is provided and model doesn't exist locally
if [ -n "$MODEL_GCS_URI" ] && [ ! -f "$MODEL_PATH" ]; then
    echo "[*] Downloading model from GCS: $MODEL_GCS_URI"
    mkdir -p $(dirname $MODEL_PATH)
    
    # Use gcloud/gsutil if available, otherwise use Python
    if command -v gsutil &> /dev/null; then
        gsutil cp "$MODEL_GCS_URI" "$MODEL_PATH"
    else
        python3 -c "
from google.cloud import storage
import os

uri = os.environ['MODEL_GCS_URI']
# Parse gs://bucket/path format
parts = uri.replace('gs://', '').split('/', 1)
bucket_name, blob_path = parts[0], parts[1]

client = storage.Client()
bucket = client.bucket(bucket_name)
blob = bucket.blob(blob_path)

print(f'Downloading {blob_path} from {bucket_name}...')
blob.download_to_filename(os.environ['MODEL_PATH'])
print('Download complete!')
"
    fi
    echo "[+] Model downloaded successfully"
fi

# Verify model exists
if [ ! -f "$MODEL_PATH" ]; then
    echo "[!] ERROR: Model file not found at $MODEL_PATH"
    echo "[!] Either set MODEL_GCS_URI or ensure model is baked into the image"
    exit 1
fi

echo "[+] Model found: $(ls -lh $MODEL_PATH | awk '{print $5}')"

# Check GPU availability
python3 -c "
import subprocess
try:
    result = subprocess.run(['nvidia-smi'], capture_output=True, text=True)
    print(result.stdout[:500] if result.returncode == 0 else 'nvidia-smi failed')
except Exception as e:
    print(f'GPU check failed: {e}')
"

echo "[*] Starting FastAPI server on port ${PORT:-8080}..."
exec uvicorn main:app --host 0.0.0.0 --port ${PORT:-8080} --workers 1
