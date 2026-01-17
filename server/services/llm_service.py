"""
LLM4Decompile service for converting Ghidra pseudo-code to correct C code.

This service uses the LLM4Decompile model from Hugging Face to convert
messy Ghidra pseudo-code into compilable, correct C code.

Model: LLM4Binary/llm4decompile-6.7b-v2
- Specialized for decompilation tasks
- Trained on 2B tokens of assembly/C pairs
- 4-bit quantization for memory efficiency (~5-7GB RAM)
"""

import os
from typing import Optional, Tuple

# Check if we can use the model
LLM4DECOMPILE_AVAILABLE = False
_model = None
_tokenizer = None

# Try to import torch and transformers
try:
    import torch
    from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
    LLM4DECOMPILE_AVAILABLE = True
except ImportError as e:
    print(f"[!] LLM4Decompile dependencies not available: {e}")
    print("[*] Install with: pip install torch transformers accelerate bitsandbytes")

MODEL_ID = "LLM4Binary/llm4decompile-6.7b-v2"


def is_available() -> bool:
    """Check if LLM4Decompile is available."""
    return LLM4DECOMPILE_AVAILABLE


def get_model() -> Tuple[Optional[object], Optional[object]]:
    """
    Lazy-load the LLM4Decompile model with 4-bit quantization.
    Returns (model, tokenizer) tuple.
    """
    global _model, _tokenizer
    
    if not LLM4DECOMPILE_AVAILABLE:
        print("[!] LLM4Decompile not available - missing dependencies")
        return None, None
    
    if _model is None:
        print(f"[*] Loading LLM4Decompile 6.7B (4-bit quantized)...")
        print(f"[*] This may take 1-2 minutes on first load...")
        
        try:
            # 4-bit quantization config for memory efficiency
            # Reduces ~28GB model to ~5-7GB
            bnb_config = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,  # Further memory savings
            )
            
            _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
            _model = AutoModelForCausalLM.from_pretrained(
                MODEL_ID,
                quantization_config=bnb_config,
                device_map="auto",
                low_cpu_mem_usage=True,
                trust_remote_code=True,
            )
            
            # Set pad token if not set
            if _tokenizer.pad_token is None:
                _tokenizer.pad_token = _tokenizer.eos_token
            
            print(f"[+] LLM4Decompile model loaded successfully")
            print(f"[+] Device: {next(_model.parameters()).device}")
            
        except Exception as e:
            print(f"[!] Failed to load LLM4Decompile model: {e}")
            return None, None
    
    return _model, _tokenizer


def decompile_to_c(pseudo_code: str) -> str:
    """
    Stage 1: Convert Ghidra pseudo-code to correct C using LLM4Decompile.
    
    The model expects a specific prompt format:
    # This is the assembly code:
    <pseudo_code>
    # What is the source code?
    
    Args:
        pseudo_code: Raw Ghidra pseudo-code to decompile
        
    Returns:
        Corrected C code (or original if model unavailable)
    """
    model, tokenizer = get_model()
    
    if model is None or tokenizer is None:
        print("[!] LLM4Decompile not available, returning original code")
        return pseudo_code
    
    # LLM4Decompile expects this specific prompt format
    prompt = f"# This is the assembly code:\n{pseudo_code}\n# What is the source code?\n"
    
    try:
        inputs = tokenizer(
            prompt, 
            return_tensors="pt",
            truncation=True,
            max_length=4096,  # Model's max context
        ).to(model.device)
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=2048,
                do_sample=False,  # Deterministic output for consistency
                pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        
        # Decode only the new tokens (skip the prompt)
        prompt_length = inputs.input_ids.shape[1]
        result = tokenizer.decode(
            outputs[0][prompt_length:], 
            skip_special_tokens=True
        )
        
        return result.strip()
        
    except Exception as e:
        print(f"[!] Error during LLM4Decompile inference: {e}")
        return pseudo_code


def mock_decompile_to_c(pseudo_code: str) -> str:
    """
    Mock decompilation for testing without the actual model.
    Performs basic transformations to simulate LLM4Decompile output.
    """
    result = pseudo_code
    
    # Basic type fixes
    result = result.replace("undefined8", "uint64_t")
    result = result.replace("undefined4", "uint32_t")
    result = result.replace("undefined2", "uint16_t")
    result = result.replace("undefined", "uint8_t")
    
    # Basic variable renames (simple patterns)
    result = result.replace("(void *)0x0", "NULL")
    result = result.replace("== 0x0", "== NULL")
    result = result.replace("!= 0x0", "!= NULL")
    
    return result
