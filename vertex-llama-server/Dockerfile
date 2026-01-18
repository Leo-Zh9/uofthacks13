# Vertex AI Custom Container for GGUF Model Inference
# Uses llama-cpp-python with CUDA support for fast GPU inference
#
# Build for different GPU architectures:
# - T4 (sm_75): CUDA_ARCH=75  - Good balance of cost/performance
# - L4 (sm_89): CUDA_ARCH=89  - Newer, faster, better availability
# - A100 (sm_80): CUDA_ARCH=80 - Best performance, highest cost
#
# Build command:
# docker build --build-arg CUDA_ARCH=75 -t llama-gguf-server .

ARG CUDA_VERSION=12.1.1
FROM nvidia/cuda:${CUDA_VERSION}-devel-ubuntu22.04 AS builder

ARG CUDA_ARCH=75
ENV CUDA_ARCH=${CUDA_ARCH}

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    cmake \
    git \
    && rm -rf /var/lib/apt/lists/*

# Build llama-cpp-python with CUDA support
# This gives us a proper Python API instead of subprocess calls
ENV CMAKE_ARGS="-DGGML_CUDA=on -DCUDA_ARCHITECTURES=${CUDA_ARCH}"
ENV FORCE_CMAKE=1

RUN pip3 install --no-cache-dir \
    llama-cpp-python==0.2.90 \
    --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121

# Runtime stage - smaller image
FROM nvidia/cuda:${CUDA_VERSION}-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy llama-cpp-python from builder
COPY --from=builder /usr/local/lib/python3.10/dist-packages /usr/local/lib/python3.10/dist-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Install FastAPI and dependencies
RUN pip3 install --no-cache-dir \
    fastapi==0.115.0 \
    uvicorn==0.32.0 \
    google-cloud-storage==2.14.0 \
    pydantic==2.10.0 \
    httpx==0.27.0

# Create app directory
WORKDIR /app

# Copy application code
COPY app/ /app/
COPY start.sh /start.sh
RUN chmod +x /start.sh

# Vertex AI expects the container to listen on port 8080
ENV PORT=8080
ENV AIP_HTTP_PORT=8080
ENV AIP_HEALTH_ROUTE=/health
ENV AIP_PREDICT_ROUTE=/predict

# Model configuration (can be overridden at deploy time)
ENV MODEL_PATH=/models/model.gguf
ENV MODEL_GCS_URI=""
ENV N_GPU_LAYERS=-1
ENV N_CTX=4096
ENV N_BATCH=512

EXPOSE 8080

# Health check for Vertex AI
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["/start.sh"]
