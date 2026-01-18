#!/bin/bash
# =============================================================================
# Vertex AI GGUF Model Deployment Script
# =============================================================================
#
# This script builds the Docker image, pushes to Artifact Registry, uploads
# the model to GCS, and deploys to Vertex AI with GPU support.
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Docker installed
# - A GGUF model file (e.g., llm4decompile-1.3b-v2.Q4_K_M.gguf)
#
# Usage:
#   ./deploy.sh [--model-path /path/to/model.gguf] [--gpu-type T4|L4|A100]
#
# =============================================================================

set -e

# Configuration (modify these for your project)
PROJECT_ID="${GCP_PROJECT_ID:-your-project-id}"
REGION="${GCP_REGION:-us-central1}"
REPO_NAME="llm-models"
IMAGE_NAME="llama-gguf-server"
MODEL_BUCKET="${MODEL_BUCKET:-${PROJECT_ID}-models}"
ENDPOINT_NAME="llama-decompile-endpoint"
MODEL_NAME="llama-decompile"

# GPU Configuration
# T4: sm_75, cost-effective, 16GB VRAM
# L4: sm_89, newer/faster, 24GB VRAM  
# A100: sm_80, best performance, 40/80GB VRAM
GPU_TYPE="${GPU_TYPE:-NVIDIA_TESLA_T4}"
CUDA_ARCH="75"  # Default for T4

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --model-path)
            LOCAL_MODEL_PATH="$2"
            shift 2
            ;;
        --gpu-type)
            case "$2" in
                T4) GPU_TYPE="NVIDIA_TESLA_T4"; CUDA_ARCH="75" ;;
                L4) GPU_TYPE="NVIDIA_L4"; CUDA_ARCH="89" ;;
                A100) GPU_TYPE="NVIDIA_TESLA_A100"; CUDA_ARCH="80" ;;
                *) echo "Unknown GPU type: $2"; exit 1 ;;
            esac
            shift 2
            ;;
        --project)
            PROJECT_ID="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "============================================="
echo "Vertex AI GGUF Model Deployment"
echo "============================================="
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "GPU Type: ${GPU_TYPE} (CUDA arch ${CUDA_ARCH})"
echo "Model Path: ${LOCAL_MODEL_PATH:-'(not provided, skipping upload)'}"
echo "============================================="

# Check prerequisites
if ! command -v gcloud &> /dev/null; then
    echo "ERROR: gcloud CLI not found. Please install it first."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "ERROR: docker not found. Please install it first."
    exit 1
fi

# Set project
gcloud config set project ${PROJECT_ID}

# Enable required APIs
echo "[1/7] Enabling required APIs..."
gcloud services enable \
    artifactregistry.googleapis.com \
    aiplatform.googleapis.com \
    storage.googleapis.com \
    --quiet

# Create Artifact Registry repo if needed
echo "[2/7] Setting up Artifact Registry..."
gcloud artifacts repositories create ${REPO_NAME} \
    --repository-format=docker \
    --location=${REGION} \
    --description="LLM model containers" \
    --quiet 2>/dev/null || echo "Repository already exists"

# Configure Docker auth
gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet

# Build Docker image
echo "[3/7] Building Docker image for CUDA arch ${CUDA_ARCH}..."
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${IMAGE_NAME}:latest"

docker build \
    --build-arg CUDA_ARCH=${CUDA_ARCH} \
    -t ${IMAGE_URI} \
    .

# Push to Artifact Registry
echo "[4/7] Pushing image to Artifact Registry..."
docker push ${IMAGE_URI}

# Upload model to GCS (if provided)
MODEL_GCS_URI=""
if [ -n "$LOCAL_MODEL_PATH" ] && [ -f "$LOCAL_MODEL_PATH" ]; then
    echo "[5/7] Uploading model to GCS..."
    
    # Create bucket if needed
    gsutil mb -l ${REGION} gs://${MODEL_BUCKET} 2>/dev/null || echo "Bucket exists"
    
    MODEL_FILENAME=$(basename ${LOCAL_MODEL_PATH})
    MODEL_GCS_URI="gs://${MODEL_BUCKET}/models/${MODEL_FILENAME}"
    
    gsutil -o GSUtil:parallel_composite_upload_threshold=150M cp ${LOCAL_MODEL_PATH} ${MODEL_GCS_URI}
    echo "Model uploaded to: ${MODEL_GCS_URI}"
else
    echo "[5/7] Skipping model upload (no model path provided)"
    echo "      Set MODEL_GCS_URI environment variable when deploying"
fi

# Create Vertex AI Model resource
echo "[6/7] Creating Vertex AI Model resource..."
MODEL_RESOURCE=$(gcloud ai models upload \
    --region=${REGION} \
    --display-name="${MODEL_NAME}" \
    --container-image-uri="${IMAGE_URI}" \
    --container-env-vars="MODEL_GCS_URI=${MODEL_GCS_URI},N_GPU_LAYERS=-1,N_CTX=4096" \
    --container-health-route="/health" \
    --container-predict-route="/predict" \
    --container-ports=8080 \
    --format="value(model)" \
    2>&1 | tail -1)

echo "Model resource created: ${MODEL_RESOURCE}"

# Create endpoint
echo "[7/7] Creating and deploying to endpoint..."
ENDPOINT_ID=$(gcloud ai endpoints create \
    --region=${REGION} \
    --display-name="${ENDPOINT_NAME}" \
    --format="value(name)" \
    2>&1 | tail -1)

echo "Endpoint created: ${ENDPOINT_ID}"

# Deploy model to endpoint with GPU
gcloud ai endpoints deploy-model ${ENDPOINT_ID} \
    --region=${REGION} \
    --model="${MODEL_RESOURCE}" \
    --display-name="${MODEL_NAME}-deployment" \
    --machine-type="n1-standard-8" \
    --accelerator="count=1,type=${GPU_TYPE}" \
    --min-replica-count=1 \
    --max-replica-count=1 \
    --traffic-split="0=100"

echo "============================================="
echo "Deployment Complete!"
echo "============================================="
echo ""
echo "Endpoint ID: ${ENDPOINT_ID}"
echo "Region: ${REGION}"
echo ""
echo "To test the endpoint:"
echo "  gcloud ai endpoints predict ${ENDPOINT_ID} \\"
echo "    --region=${REGION} \\"
echo "    --json-request=test_request.json"
echo ""
echo "Or use the Python client in your app (see vertex_client.py)"
echo "============================================="
