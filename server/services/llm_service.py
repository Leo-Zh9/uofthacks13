"""
LLM4Decompile service for refining Ghidra pseudo-C into clean C code.

This service uses the LLM4Decompile-1.3b-v2 (Refine) model from Hugging Face.
This model is specifically trained to take Ghidra's pseudo-C output and
convert it into clean, valid C code.

Model: LLM4Binary/llm4decompile-1.3b-v2
- 1.3B parameters (small and fast)
- Trained specifically on Ghidra pseudo-C refinement
- ~0.8GB with 4-bit quantization, ~2.6GB FP16
"""

import os
import re
from typing import Optional, Tuple

# Check if disabled via environment variable
DISABLED_BY_ENV = os.environ.get("DISABLE_LLM4DECOMPILE", "").lower() in ("true", "1", "yes")
if DISABLED_BY_ENV:
    print("[*] LLM4Decompile disabled via DISABLE_LLM4DECOMPILE env var")

# Check if we can use the model
LLM4DECOMPILE_AVAILABLE = False
BITSANDBYTES_AVAILABLE = False
_model = None
_tokenizer = None
torch = None

if not DISABLED_BY_ENV:
    # Try to import torch and transformers
    try:
        import torch as _torch
        torch = _torch
        from transformers import AutoTokenizer, AutoModelForCausalLM
        print(f"[+] PyTorch {torch.__version__} loaded successfully")
        
        # Check for CUDA
        if torch.cuda.is_available():
            print(f"[+] CUDA available: {torch.cuda.get_device_name(0)}")
        else:
            print("[*] Running on CPU (slower inference)")
        
        # Check for bitsandbytes (for 4-bit quantization)
        try:
            from transformers import BitsAndBytesConfig
            import bitsandbytes
            BITSANDBYTES_AVAILABLE = True
            print("[+] bitsandbytes available for 4-bit quantization (~0.8GB RAM)")
        except ImportError:
            print("[*] bitsandbytes not available - will use FP16 (~2.6GB RAM)")
        
        LLM4DECOMPILE_AVAILABLE = True
        
    except ImportError as e:
        print(f"[!] LLM4Decompile dependencies not available: {e}")
        print("[*] Install with: pip install torch transformers accelerate")
    except OSError as e:
        print(f"[!] LLM4Decompile DLL/SO loading failed: {e}")
        print("[*] Try reinstalling torch in a clean environment")
    except Exception as e:
        print(f"[!] Unexpected error loading LLM4Decompile: {e}")

# Use the 1.3B Refine model - trained specifically on Ghidra pseudo-C
MODEL_ID = "LLM4Binary/llm4decompile-1.3b-v2"


def is_available() -> bool:
    """Check if LLM4Decompile is available."""
    return LLM4DECOMPILE_AVAILABLE and not DISABLED_BY_ENV


def get_model() -> Tuple[Optional[object], Optional[object]]:
    """
    Lazy-load the LLM4Decompile 1.3B model.
    Uses 4-bit quantization if bitsandbytes is available, otherwise FP16.
    Returns (model, tokenizer) tuple.
    """
    global _model, _tokenizer
    
    if not is_available():
        print("[!] LLM4Decompile not available")
        return None, None
    
    if _model is None:
        from transformers import AutoTokenizer, AutoModelForCausalLM
        
        try:
            if BITSANDBYTES_AVAILABLE and torch.cuda.is_available():
                # 4-bit quantization for memory efficiency (~0.8GB)
                from transformers import BitsAndBytesConfig
                print(f"[*] Loading LLM4Decompile 1.3B (4-bit quantized)...")
                print(f"[*] This may take 30-60 seconds on first load...")
                
                bnb_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                    bnb_4bit_quant_type="nf4",
                    bnb_4bit_use_double_quant=True,
                )
                
                _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
                _model = AutoModelForCausalLM.from_pretrained(
                    MODEL_ID,
                    quantization_config=bnb_config,
                    device_map="auto",
                    low_cpu_mem_usage=True,
                    trust_remote_code=True,
                )
            else:
                # FP16 without quantization (~2.6GB RAM for 1.3B model)
                print(f"[*] Loading LLM4Decompile 1.3B (FP16)...")
                print(f"[*] This may take 30-60 seconds on first load...")
                
                _tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
                
                # Use GPU if available, otherwise CPU
                if torch.cuda.is_available():
                    _model = AutoModelForCausalLM.from_pretrained(
                        MODEL_ID,
                        torch_dtype=torch.float16,
                        device_map="auto",
                        low_cpu_mem_usage=True,
                        trust_remote_code=True,
                    )
                else:
                    # CPU inference - use float32 for stability
                    _model = AutoModelForCausalLM.from_pretrained(
                        MODEL_ID,
                        torch_dtype=torch.float32,
                        low_cpu_mem_usage=True,
                        trust_remote_code=True,
                    )
            
            # Set pad token if not set
            if _tokenizer.pad_token is None:
                _tokenizer.pad_token = _tokenizer.eos_token
            
            device = next(_model.parameters()).device
            print(f"[+] LLM4Decompile 1.3B model loaded successfully")
            print(f"[+] Device: {device}")
            
        except Exception as e:
            print(f"[!] Failed to load LLM4Decompile model: {e}")
            import traceback
            traceback.print_exc()
            return None, None
    
    return _model, _tokenizer


def decompile_to_c(ghidra_pseudo_c: str) -> str:
    """
    Refine Ghidra pseudo-C into clean C code using LLM4Decompile.
    
    The LLM4Decompile-1.3b-v2 (Refine) model expects Ghidra's pseudo-C
    format as input and outputs cleaner C code.
    
    Prompt format for Refine model:
    # This is the Ghidra pseudo-C:
    <ghidra_code>
    # What is the source code?
    
    Args:
        ghidra_pseudo_c: Raw Ghidra pseudo-C code to refine
        
    Returns:
        Refined C code (or original if model unavailable)
    """
    model, tokenizer = get_model()
    
    if model is None or tokenizer is None:
        print("[!] LLM4Decompile not available, returning original code")
        return ghidra_pseudo_c
    
    # LLM4Decompile Refine model prompt format
    # The model expects Ghidra pseudo-C and outputs refined C
    prompt = f"# This is the Ghidra pseudo-C:\n{ghidra_pseudo_c}\n# What is the source code?\n"
    
    try:
        inputs = tokenizer(
            prompt, 
            return_tensors="pt",
            truncation=True,
            max_length=4096,
        ).to(model.device)
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=2048,
                do_sample=False,  # Deterministic for consistency
                pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
        
        # Decode only the new tokens (skip the prompt)
        prompt_length = inputs.input_ids.shape[1]
        result = tokenizer.decode(
            outputs[0][prompt_length:], 
            skip_special_tokens=True
        )
        
        # Post-process to fix formatting (LLM sometimes outputs minified code)
        formatted = _format_c_code(result.strip())
        return formatted
        
    except Exception as e:
        print(f"[!] Error during LLM4Decompile inference: {e}")
        import traceback
        traceback.print_exc()
        return ghidra_pseudo_c


def _format_c_code(code: str) -> str:
    """
    Post-process LLM output to ensure proper C formatting.
    LLM4Decompile sometimes outputs minified code - this fixes that.
    """
    if not code or '\n' in code and code.count('\n') > 5:
        # Already has formatting, don't mess with it
        return code
    
    result = code
    
    # Add newlines after semicolons (but not in for loops)
    # First protect for loops
    for_loops = re.findall(r'for\s*\([^)]+\)', result)
    for i, loop in enumerate(for_loops):
        result = result.replace(loop, f'__FOR_LOOP_{i}__')
    
    # Add newline after semicolons
    result = re.sub(r';(?!\s*\n)', ';\n', result)
    
    # Restore for loops
    for i, loop in enumerate(for_loops):
        result = result.replace(f'__FOR_LOOP_{i}__', loop)
    
    # Add newline after opening braces
    result = re.sub(r'\{(?!\s*\n)', '{\n', result)
    
    # Add newline before closing braces
    result = re.sub(r'(?<!\n)\s*\}', '\n}', result)
    
    # Add newline after closing braces (but not before else/else if)
    result = re.sub(r'\}(?!\s*else)(?!\s*\n)(?!\s*$)', '}\n', result)
    
    # Fix multiple newlines
    result = re.sub(r'\n{3,}', '\n\n', result)
    
    # Basic indentation - count braces
    lines = result.split('\n')
    formatted_lines = []
    indent = 0
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            formatted_lines.append('')
            continue
        
        # Decrease indent before closing brace
        if stripped.startswith('}'):
            indent = max(0, indent - 1)
        
        # Add indentation
        formatted_lines.append('    ' * indent + stripped)
        
        # Increase indent after opening brace
        if stripped.endswith('{'):
            indent += 1
    
    return '\n'.join(formatted_lines)


def mock_decompile_to_c(pseudo_code: str) -> str:
    """
    Mock decompilation for testing without the actual model.
    Performs basic transformations to simulate LLM4Decompile output.
    """
    result = pseudo_code
    
    # Basic type fixes (Ghidra-specific types)
    result = result.replace("undefined8", "uint64_t")
    result = result.replace("undefined4", "uint32_t")
    result = result.replace("undefined2", "uint16_t")
    result = result.replace("undefined1", "uint8_t")
    result = result.replace("undefined", "uint8_t")
    result = result.replace("longlong", "int64_t")
    result = result.replace("ulonglong", "uint64_t")
    
    # Basic pointer fixes
    result = result.replace("(void *)0x0", "NULL")
    result = result.replace("== 0x0", "== NULL")
    result = result.replace("!= 0x0", "!= NULL")
    
    # Apply formatting
    return _format_c_code(result)
