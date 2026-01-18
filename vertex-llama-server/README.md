# Deploying GGUF Models on Google Cloud Vertex AI

This directory contains everything needed to deploy a quantized GGUF model (like LLM4Decompile) on Vertex AI with GPU acceleration.

## Overview

```
┌─────────────────┐     HTTP Request     ┌──────────────────────────────┐
│   Your App      │ ──────────────────► │  Vertex AI Endpoint          │
│   (FastAPI)     │                      │  ┌────────────────────────┐  │
│                 │ ◄────────────────── │  │  GGUF Model Container  │  │
│                 │     JSON Response    │  │  (llama-cpp-python)    │  │
└─────────────────┘                      │  │  + T4/L4/A100 GPU      │  │
                                         │  └────────────────────────┘  │
                                         └──────────────────────────────┘
```

## Prerequisites

1. **Google Cloud Account** with billing enabled
2. **gcloud CLI** installed and authenticated:
   ```bash
   gcloud auth login
   gcloud auth application-default login
   ```
3. **Docker** installed (with BuildKit support recommended)
4. **A GGUF model file** - you can quantize your own or download one:
   - [LLM4Decompile GGUF models on Hugging Face](https://huggingface.co/models?search=llm4decompile+gguf)
   - Or quantize with: `python -m llama_cpp.convert --outfile model.gguf`

## Quick Start

### 1. Set up your GCP project

```bash
# Set your project ID
export GCP_PROJECT_ID="your-project-id"
export GCP_REGION="us-central1"

gcloud config set project $GCP_PROJECT_ID
```

### 2. Build and deploy

```bash
cd vertex-llama-server

# Make deploy script executable (Linux/Mac)
chmod +x deploy.sh

# Deploy with T4 GPU (cost-effective, ~$0.35/hr)
./deploy.sh --model-path /path/to/your-model.gguf --gpu-type T4

# Or with L4 GPU (faster, ~$0.70/hr)
./deploy.sh --model-path /path/to/your-model.gguf --gpu-type L4

# Or with A100 GPU (fastest, ~$3.00/hr)
./deploy.sh --model-path /path/to/your-model.gguf --gpu-type A100
```

### 3. Configure your app

Add to your `.env` or environment:

```bash
# Required
VERTEX_ENDPOINT_ID="1234567890"  # Get this from deploy output
GCP_PROJECT_ID="your-project-id"
GCP_REGION="us-central1"

# Optional: Disable local LLM4Decompile (use only Vertex)
DISABLE_LLM4DECOMPILE=true
```

### 4. Use in your code

```python
from services.vertex_client import decompile_with_vertex

# Async usage
refined_code = await decompile_with_vertex(ghidra_pseudo_c)
```

## GPU Selection Guide

| GPU | VRAM | Cost/hr | Best For |
|-----|------|---------|----------|
| T4 | 16GB | ~$0.35 | Small models (1-7B), cost-sensitive |
| L4 | 24GB | ~$0.70 | Medium models (7-13B), good balance |
| A100 40GB | 40GB | ~$3.00 | Large models (13B+), max performance |
| A100 80GB | 80GB | ~$4.00 | Very large models (30B+) |

For **LLM4Decompile 1.3B** quantized (Q4_K_M ~0.8GB), a **T4** is more than enough.

## Model Quantization

If you need to quantize a model yourself:

```bash
# Install llama.cpp tools
pip install llama-cpp-python

# Download model from Hugging Face
huggingface-cli download LLM4Binary/llm4decompile-1.3b-v2 --local-dir ./model

# Convert to GGUF (if not already)
python -m llama_cpp.convert ./model --outfile llm4decompile-1.3b.gguf

# Quantize to Q4_K_M (recommended balance of speed/quality)
./quantize llm4decompile-1.3b.gguf llm4decompile-1.3b-Q4_K_M.gguf Q4_K_M
```

## Architecture Details

### Dockerfile

- **Multi-stage build**: Compiles llama-cpp-python with CUDA support
- **Configurable CUDA arch**: Build for T4 (sm_75), L4 (sm_89), or A100 (sm_80)
- **Slim runtime image**: Only includes necessary CUDA runtime libs

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (required by Vertex AI) |
| `/predict` | POST | Vertex AI standard prediction format |
| `/decompile` | POST | Direct decompilation (simpler request format) |
| `/v1/completions` | POST | OpenAI-compatible completions API |

### Request Format

**Vertex AI `/predict`:**
```json
{
  "instances": [
    {"ghidra_code": "...", "max_tokens": 2048}
  ],
  "parameters": {"temperature": 0.0}
}
```

**Direct `/decompile`:**
```json
{
  "ghidra_code": "undefined8 main(void) { ... }",
  "max_tokens": 2048,
  "temperature": 0.0
}
```

## Cost Optimization

1. **Use min/max replicas**: Set `--min-replica-count=0` for auto-scaling to zero when idle (adds cold start latency)

2. **Choose the right GPU**: Don't over-provision - T4 is usually enough for quantized models

3. **Enable request batching**: If you process many functions, batch them in single requests

4. **Consider Cloud Run**: For sporadic usage, Cloud Run GPU (preview) may be cheaper than Vertex AI endpoints

## Troubleshooting

### "CUDA error: no kernel image is available"
You compiled for the wrong GPU architecture. Rebuild with the correct `--gpu-type` flag.

### Model loading is slow
First load downloads the model from GCS. Subsequent requests use the cached model. Consider baking the model into the Docker image for faster cold starts.

### Out of memory errors
The model is too large for your GPU. Try:
- A more aggressive quantization (Q4_0 instead of Q4_K_M)
- A smaller model
- A GPU with more VRAM

### Authentication errors
Make sure you've run:
```bash
gcloud auth application-default login
```

And the service account has the `aiplatform.endpoints.predict` permission.

## Files

- `Dockerfile` - Multi-stage build for CUDA-enabled container
- `start.sh` - Container entrypoint (downloads model, starts server)
- `app/main.py` - FastAPI server with prediction endpoints
- `deploy.sh` - Deployment automation script
- `test_request.json` - Example request for testing
