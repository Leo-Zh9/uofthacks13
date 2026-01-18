"""
Vertex AI Custom Container - GGUF Model Inference Server

This server wraps a GGUF model (e.g., LLM4Decompile quantized) and exposes it
via a FastAPI endpoint compatible with Vertex AI prediction requirements.

Endpoints:
- POST /predict - Vertex AI standard prediction endpoint
- POST /v1/completions - OpenAI-compatible completions API
- GET /health - Health check for Vertex AI
"""

import os
import time
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global model instance
_llm = None


def get_model():
    """Lazy-load the GGUF model."""
    global _llm
    if _llm is None:
        from llama_cpp import Llama
        
        model_path = os.environ.get("MODEL_PATH", "/models/model.gguf")
        n_gpu_layers = int(os.environ.get("N_GPU_LAYERS", "-1"))  # -1 = all layers on GPU
        n_ctx = int(os.environ.get("N_CTX", "4096"))
        n_batch = int(os.environ.get("N_BATCH", "512"))
        
        logger.info(f"Loading GGUF model from {model_path}")
        logger.info(f"GPU layers: {n_gpu_layers}, Context: {n_ctx}, Batch: {n_batch}")
        
        start = time.time()
        _llm = Llama(
            model_path=model_path,
            n_gpu_layers=n_gpu_layers,
            n_ctx=n_ctx,
            n_batch=n_batch,
            verbose=True,
        )
        logger.info(f"Model loaded in {time.time() - start:.2f}s")
    
    return _llm


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load model on startup."""
    logger.info("Starting up - loading model...")
    try:
        get_model()
        logger.info("Model ready for inference")
    except Exception as e:
        logger.error(f"Failed to load model: {e}")
        # Don't raise - let health check fail instead
    yield
    logger.info("Shutting down...")


app = FastAPI(
    title="GGUF Model Server",
    description="Vertex AI compatible GGUF inference server",
    version="1.0.0",
    lifespan=lifespan,
)


# ============================================================================
# Request/Response Models
# ============================================================================

class PredictRequest(BaseModel):
    """Vertex AI prediction request format."""
    instances: List[Dict[str, Any]]
    parameters: Optional[Dict[str, Any]] = None


class PredictResponse(BaseModel):
    """Vertex AI prediction response format."""
    predictions: List[Dict[str, Any]]
    

class DecompileRequest(BaseModel):
    """Request for decompiling Ghidra pseudo-C."""
    ghidra_code: str = Field(..., description="Ghidra pseudo-C code to refine")
    max_tokens: int = Field(2048, description="Maximum tokens to generate")
    temperature: float = Field(0.0, description="Sampling temperature (0 = greedy)")
    

class DecompileResponse(BaseModel):
    """Response with refined C code."""
    refined_code: str
    tokens_used: int
    inference_time_ms: float


class CompletionRequest(BaseModel):
    """OpenAI-compatible completion request."""
    prompt: str
    max_tokens: int = 2048
    temperature: float = 0.0
    stop: Optional[List[str]] = None


class CompletionResponse(BaseModel):
    """OpenAI-compatible completion response."""
    id: str
    object: str = "text_completion"
    created: int
    model: str
    choices: List[Dict[str, Any]]
    usage: Dict[str, int]


# ============================================================================
# Endpoints
# ============================================================================

@app.get("/health")
async def health():
    """Health check endpoint for Vertex AI."""
    try:
        model = get_model()
        return {"status": "healthy", "model_loaded": model is not None}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not ready: {e}")


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "service": "GGUF Model Server",
        "endpoints": {
            "/health": "Health check",
            "/predict": "Vertex AI prediction (POST)",
            "/v1/completions": "OpenAI-compatible completions (POST)",
            "/decompile": "Ghidra pseudo-C refinement (POST)",
        }
    }


@app.post("/predict", response_model=PredictResponse)
async def predict(request: PredictRequest):
    """
    Vertex AI standard prediction endpoint.
    
    Expects requests in format:
    {
        "instances": [
            {"ghidra_code": "...", "max_tokens": 2048}
        ],
        "parameters": {"temperature": 0.0}
    }
    """
    try:
        model = get_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not loaded: {e}")
    
    predictions = []
    params = request.parameters or {}
    temperature = params.get("temperature", 0.0)
    
    for instance in request.instances:
        ghidra_code = instance.get("ghidra_code", instance.get("prompt", ""))
        max_tokens = instance.get("max_tokens", params.get("max_tokens", 2048))
        
        if not ghidra_code:
            predictions.append({"error": "Missing ghidra_code or prompt"})
            continue
        
        # Build prompt in LLM4Decompile format
        prompt = f"# This is the Ghidra pseudo-C:\n{ghidra_code}\n# What is the source code?\n"
        
        start = time.time()
        output = model(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            stop=["# This is", "\n\n\n"],
            echo=False,
        )
        inference_time = (time.time() - start) * 1000
        
        refined_code = output["choices"][0]["text"].strip()
        tokens_used = output["usage"]["total_tokens"]
        
        predictions.append({
            "refined_code": refined_code,
            "tokens_used": tokens_used,
            "inference_time_ms": inference_time,
        })
    
    return PredictResponse(predictions=predictions)


@app.post("/decompile", response_model=DecompileResponse)
async def decompile(request: DecompileRequest):
    """
    Direct decompilation endpoint (simpler than /predict).
    
    Processes Ghidra pseudo-C and returns refined C code.
    """
    try:
        model = get_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not loaded: {e}")
    
    # Build prompt in LLM4Decompile format
    prompt = f"# This is the Ghidra pseudo-C:\n{request.ghidra_code}\n# What is the source code?\n"
    
    start = time.time()
    output = model(
        prompt,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        stop=["# This is", "\n\n\n"],
        echo=False,
    )
    inference_time = (time.time() - start) * 1000
    
    refined_code = output["choices"][0]["text"].strip()
    tokens_used = output["usage"]["total_tokens"]
    
    return DecompileResponse(
        refined_code=refined_code,
        tokens_used=tokens_used,
        inference_time_ms=inference_time,
    )


@app.post("/v1/completions", response_model=CompletionResponse)
async def completions(request: CompletionRequest):
    """
    OpenAI-compatible completions endpoint.
    
    Useful for testing with standard tools or if you want to use
    the model for other tasks beyond decompilation.
    """
    try:
        model = get_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not loaded: {e}")
    
    start = time.time()
    output = model(
        request.prompt,
        max_tokens=request.max_tokens,
        temperature=request.temperature,
        stop=request.stop,
        echo=False,
    )
    
    return CompletionResponse(
        id=f"cmpl-{int(time.time()*1000)}",
        created=int(time.time()),
        model=os.environ.get("MODEL_PATH", "gguf-model"),
        choices=[{
            "text": output["choices"][0]["text"],
            "index": 0,
            "finish_reason": output["choices"][0].get("finish_reason", "stop"),
        }],
        usage=output["usage"],
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8080)))
