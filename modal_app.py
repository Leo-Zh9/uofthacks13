"""
Modal deployment for LLM4Decompile model with GPU acceleration.

This runs LLM4Decompile 9B Q8_0 (higher precision quantization) on Modal's cloud GPUs.
Deploy with: modal deploy modal_app.py

Endpoint: https://<your-workspace>--llm4decompile-decompile.modal.run
"""

import modal

# Create the Modal app
app = modal.App("llm4decompile")

# GGUF model from HuggingFace - Q8_0 for higher precision
MODEL_REPO = "tensorblock/llm4decompile-9b-v2-GGUF"
MODEL_FILE = "llm4decompile-9b-v2-Q8_0.gguf"

# Define the container image with CUDA support for llama-cpp-python
image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.1.0-runtime-ubuntu22.04",
        add_python="3.11"
    )
    .apt_install("libgomp1")  # OpenMP library required by llama-cpp-python
    .pip_install(
        "huggingface_hub",
        "fastapi[standard]",
        "pydantic>=2.0",
    )
    # Install pre-built llama-cpp-python with CUDA 12.1 support
    .pip_install(
        "llama-cpp-python",
        extra_options="--extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cu121"
    )
)


@app.cls(
    image=image,
    gpu="A100-80GB",  # NVIDIA A100 80GB
    memory=32768,  # 32GB RAM for larger model
    timeout=600,
    scaledown_window=300,  # Keep warm for 5 minutes between requests
)
class LLM4Decompile:
    """LLM4Decompile 9B Q4_K_M model class with GPU acceleration."""
    
    @modal.enter()
    def load_model(self):
        """Download and load GGUF model on container start."""
        from huggingface_hub import hf_hub_download
        from llama_cpp import Llama
        
        print(f"Downloading {MODEL_FILE} from {MODEL_REPO}...")
        model_path = hf_hub_download(
            repo_id=MODEL_REPO,
            filename=MODEL_FILE,
        )
        print(f"Model downloaded to: {model_path}")
        
        print("Loading model with CUDA...")
        self.llm = Llama(
            model_path=model_path,
            n_gpu_layers=-1,  # Offload all layers to GPU
            n_ctx=16384,      # Context window (16K tokens)
            verbose=True,
        )
        print("Model loaded on GPU!")
    
    @modal.fastapi_endpoint(method="POST")
    def decompile(self, request: dict):
        """
        Refine Ghidra pseudo-C code to readable C.
        
        Request body:
        {
            "ghidra_code": "...",
            "max_tokens": 512,
            "temperature": 0.0
        }
        """
        import time
        
        ghidra_code = request.get("ghidra_code", "")
        max_tokens = request.get("max_tokens", 2048)
        temperature = request.get("temperature", 0.01)  # Slightly higher to reduce repetition
        
        if not ghidra_code:
            return {"error": "ghidra_code is required"}
        
        # Build prompt - explicit instruction for clean output
        prompt = f"""# This is the assembly code:
{ghidra_code}
# Decompile to clean, readable C source code. Do NOT include:
# - Line number directives (# followed by numbers)
# - File path comments
# - Training data artifacts
# Output only the C function implementation:
"""
        
        # Generate with llama.cpp
        start = time.time()
        output = self.llm(
            prompt,
            max_tokens=max_tokens,
            temperature=max(temperature, 0.01),
            top_p=0.9,  # Nucleus sampling - more natural output
            repeat_penalty=1.15,  # Penalize repetition
            frequency_penalty=0.1,  # Additional frequency-based penalty
            stop=[
                "# This is the assembly code:",
                "\n\n\n",
                "/scratch/",  # Training data path leak
                "/home/",     # Training data path leak
                "/repos/",    # Training data path leak
                '# "',        # Preprocessor line directive start
                "\n# 1",      # Line directives (# followed by digit)
                "\n# 2",
                "\n# 3",
                "\n# 4",
                "\n# 5",
                "\n# 6",
                "\n# 7",
                "\n# 8",
                "\n# 9",
            ],
            echo=False,
        )
        inference_time = (time.time() - start) * 1000
        
        refined_code = output["choices"][0]["text"].strip()
        
        # Clean up the output - remove any remaining artifacts
        import re
        # Remove preprocessor line directives: # 123 "path" or # 123
        refined_code = re.sub(r'#\s*\d+\s*"[^"]*"?', '', refined_code)
        refined_code = re.sub(r'#\s*\d+\s*$', '', refined_code, flags=re.MULTILINE)
        # Clean up markdown code fences
        if refined_code.startswith("```c"):
            refined_code = refined_code[4:]
        if refined_code.startswith("```"):
            refined_code = refined_code[3:]
        if refined_code.endswith("```"):
            refined_code = refined_code[:-3]
        # Clean up multiple blank lines
        refined_code = re.sub(r'\n{3,}', '\n\n', refined_code)
        refined_code = refined_code.strip()

        return {
            "refined_code": refined_code,
            "inference_time_ms": round(inference_time, 2),
            "tokens_generated": output["usage"]["completion_tokens"],
            "device": "cuda",
            "model": f"{MODEL_REPO}/{MODEL_FILE}",
        }
    
    @modal.fastapi_endpoint(method="GET")
    def health(self):
        """Health check endpoint."""
        return {
            "status": "healthy",
            "model": f"{MODEL_REPO}/{MODEL_FILE}",
            "quantization": "Q4_K_M",
            "device": "cuda",
        }
