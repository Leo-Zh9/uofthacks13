# =============================================================================
# Vertex AI GGUF Model Deployment Script (Windows PowerShell)
# =============================================================================
#
# This script builds the Docker image, pushes to Artifact Registry, uploads
# the model to GCS, and deploys to Vertex AI with GPU support.
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Docker Desktop installed
# - A GGUF model file (e.g., llm4decompile-1.3b-v2.Q4_K_M.gguf)
#
# Usage:
#   .\deploy.ps1 -ModelPath "C:\path\to\model.gguf" -GpuType T4
#
# =============================================================================

param(
    [Parameter()]
    [string]$ProjectId = $env:GCP_PROJECT_ID,
    
    [Parameter()]
    [string]$Region = "us-central1",
    
    [Parameter()]
    [string]$ModelPath,
    
    [Parameter()]
    [ValidateSet("T4", "L4", "A100")]
    [string]$GpuType = "T4"
)

# Configuration
$RepoName = "llm-models"
$ImageName = "llama-gguf-server"
$EndpointName = "llama-decompile-endpoint"
$ModelName = "llama-decompile"

# GPU Configuration mapping
$GpuConfig = @{
    "T4" = @{ Type = "NVIDIA_TESLA_T4"; CudaArch = "75" }
    "L4" = @{ Type = "NVIDIA_L4"; CudaArch = "89" }
    "A100" = @{ Type = "NVIDIA_TESLA_A100"; CudaArch = "80" }
}

$GpuTypeVertex = $GpuConfig[$GpuType].Type
$CudaArch = $GpuConfig[$GpuType].CudaArch

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Vertex AI GGUF Model Deployment" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "Project: $ProjectId"
Write-Host "Region: $Region"
Write-Host "GPU Type: $GpuTypeVertex (CUDA arch $CudaArch)"
Write-Host "Model Path: $(if ($ModelPath) { $ModelPath } else { '(not provided)' })"
Write-Host "=============================================" -ForegroundColor Cyan

# Validate prerequisites
if (-not $ProjectId) {
    Write-Host "ERROR: Project ID required. Set GCP_PROJECT_ID env var or use -ProjectId parameter." -ForegroundColor Red
    exit 1
}

# Check gcloud
try {
    $null = gcloud --version 2>&1
} catch {
    Write-Host "ERROR: gcloud CLI not found. Please install it first." -ForegroundColor Red
    exit 1
}

# Check Docker
try {
    $null = docker --version 2>&1
} catch {
    Write-Host "ERROR: Docker not found. Please install Docker Desktop." -ForegroundColor Red
    exit 1
}

# Set project
Write-Host "`n[1/7] Setting up GCP project..." -ForegroundColor Yellow
gcloud config set project $ProjectId

# Enable APIs
Write-Host "`n[2/7] Enabling required APIs..." -ForegroundColor Yellow
gcloud services enable `
    artifactregistry.googleapis.com `
    aiplatform.googleapis.com `
    storage.googleapis.com `
    --quiet

# Create Artifact Registry repo
Write-Host "`n[3/7] Setting up Artifact Registry..." -ForegroundColor Yellow
gcloud artifacts repositories create $RepoName `
    --repository-format=docker `
    --location=$Region `
    --description="LLM model containers" `
    --quiet 2>$null

# Configure Docker auth
gcloud auth configure-docker "$Region-docker.pkg.dev" --quiet

# Build Docker image
Write-Host "`n[4/7] Building Docker image for CUDA arch $CudaArch..." -ForegroundColor Yellow
$ImageUri = "$Region-docker.pkg.dev/$ProjectId/$RepoName/${ImageName}:latest"

docker build `
    --build-arg CUDA_ARCH=$CudaArch `
    -t $ImageUri `
    .

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker build failed!" -ForegroundColor Red
    exit 1
}

# Push to Artifact Registry
Write-Host "`n[5/7] Pushing image to Artifact Registry..." -ForegroundColor Yellow
docker push $ImageUri

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Docker push failed!" -ForegroundColor Red
    exit 1
}

# Upload model to GCS (if provided)
$ModelGcsUri = ""
$ModelBucket = "$ProjectId-models"

if ($ModelPath -and (Test-Path $ModelPath)) {
    Write-Host "`n[6/7] Uploading model to GCS..." -ForegroundColor Yellow
    
    # Create bucket if needed
    gsutil mb -l $Region "gs://$ModelBucket" 2>$null
    
    $ModelFilename = Split-Path $ModelPath -Leaf
    $ModelGcsUri = "gs://$ModelBucket/models/$ModelFilename"
    
    gsutil -o "GSUtil:parallel_composite_upload_threshold=150M" cp $ModelPath $ModelGcsUri
    Write-Host "Model uploaded to: $ModelGcsUri" -ForegroundColor Green
} else {
    Write-Host "`n[6/7] Skipping model upload (no model path provided)" -ForegroundColor Yellow
}

# Create Vertex AI Model resource
Write-Host "`n[7/7] Creating Vertex AI Model and Endpoint..." -ForegroundColor Yellow

$ModelResource = gcloud ai models upload `
    --region=$Region `
    --display-name="$ModelName" `
    --container-image-uri="$ImageUri" `
    --container-env-vars="MODEL_GCS_URI=$ModelGcsUri,N_GPU_LAYERS=-1,N_CTX=4096" `
    --container-health-route="/health" `
    --container-predict-route="/predict" `
    --container-ports=8080 `
    --format="value(model)"

Write-Host "Model resource created: $ModelResource" -ForegroundColor Green

# Create endpoint
$EndpointId = gcloud ai endpoints create `
    --region=$Region `
    --display-name="$EndpointName" `
    --format="value(name)"

Write-Host "Endpoint created: $EndpointId" -ForegroundColor Green

# Deploy model to endpoint with GPU
Write-Host "Deploying model (this may take 5-10 minutes)..." -ForegroundColor Yellow

gcloud ai endpoints deploy-model $EndpointId `
    --region=$Region `
    --model="$ModelResource" `
    --display-name="$ModelName-deployment" `
    --machine-type="n1-standard-8" `
    --accelerator="count=1,type=$GpuTypeVertex" `
    --min-replica-count=1 `
    --max-replica-count=1 `
    --traffic-split="0=100"

Write-Host "`n=============================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Endpoint ID: $EndpointId"
Write-Host "Region: $Region"
Write-Host ""
Write-Host "Add these to your .env file:" -ForegroundColor Yellow
Write-Host "  VERTEX_ENDPOINT_ID=$EndpointId"
Write-Host "  GCP_PROJECT_ID=$ProjectId"
Write-Host "  GCP_REGION=$Region"
Write-Host ""
Write-Host "To test the endpoint:" -ForegroundColor Yellow
Write-Host "  gcloud ai endpoints predict $EndpointId ``"
Write-Host "    --region=$Region ``"
Write-Host "    --json-request=test_request.json"
Write-Host "=============================================" -ForegroundColor Green
