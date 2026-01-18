"""
AI Service for code refactoring using LLM4Decompile, Vertex AI, and Gemini.

Uses the LLM4Decompile 1.3B model to refine Ghidra pseudo-C into clean C code,
then uses Gemini to further clean up and simplify the code.

Supports multiple modes:
- "Gemini Mode": Uses Gemini for refactoring (bypasses LLM4Decompile)
- "Vertex Mode": Uses GGUF model on Vertex AI (faster GPU inference in cloud)
- Default: Local LLM4Decompile + Gemini cleanup
"""

from typing import Dict, Optional

# Import LLM4Decompile service
from services.llm_service import decompile_to_c, is_available as llm4decompile_available, mock_decompile_to_c

# Import Gemini service for code cleanup and refactoring
from services.gemini_service import (
    cleanup_decompiled_code_async,
    refactor_with_gemini_async,
    is_available as gemini_available
)

# Import Vertex AI client for cloud GPU inference
from services.vertex_client import (
    decompile_with_vertex,
    is_vertex_available,
)


async def refactor_code(
    function_name: str,
    raw_code: str,
    context_functions: Optional[Dict[str, str]] = None,
    gemini_mode: bool = False,
    vertex_mode: bool = False,
) -> str:
    """
    Refactor decompiled code using LLM4Decompile, Vertex AI, and/or Gemini.
    
    Args:
        function_name: Name of the function being refactored
        raw_code: Raw decompiled C code from Ghidra
        context_functions: Optional dict of other function signatures (unused for now)
        gemini_mode: If True, use Gemini for refactoring instead of LLM4Decompile
        vertex_mode: If True, use Vertex AI GPU inference instead of local LLM
        
    Returns:
        Refactored and cleaned C code
    """
    
    # Gemini-only mode: bypass LLM4Decompile entirely
    if gemini_mode:
        if gemini_available():
            print(f"[*] Processing {function_name} with Gemini Pro (Gemini Mode)...")
            refactored = await refactor_with_gemini_async(raw_code, function_name)
            print(f"[+] Gemini Pro refactoring completed: {function_name}")
            return refactored
        else:
            print(f"[!] Gemini Mode requested but Gemini not available, falling back to LLM4Decompile")
    
    # Vertex AI mode: use cloud GPU for fast GGUF inference
    if vertex_mode or is_vertex_available():
        if is_vertex_available():
            print(f"[*] Processing {function_name} with Vertex AI (Cloud GPU)...")
            refactored = await decompile_with_vertex(raw_code)
            print(f"[+] Vertex AI inference completed: {function_name}")
            
            # Step 2: Gemini cleanup (if available)
            if gemini_available():
                print(f"[*] Cleaning up {function_name} with Gemini...")
                refactored = await cleanup_decompiled_code_async(refactored, function_name)
                print(f"[+] Gemini cleanup completed: {function_name}")
            
            return refactored
        elif vertex_mode:
            print(f"[!] Vertex Mode requested but Vertex AI not available, falling back to local")
    
    # Standard mode: Local LLM4Decompile + Gemini cleanup
    print(f"[*] Processing {function_name} with LLM4Decompile...")
    
    # Step 1: LLM4Decompile refinement
    if llm4decompile_available():
        refactored = decompile_to_c(raw_code)
        print(f"[+] LLM4Decompile completed: {function_name}")
    else:
        # Use mock transformation if LLM4Decompile not available
        print(f"[!] LLM4Decompile not available, using mock transformation")
        refactored = mock_decompile_to_c(raw_code)
    
    # Step 2: Gemini cleanup (if available)
    if gemini_available():
        print(f"[*] Cleaning up {function_name} with Gemini...")
        refactored = await cleanup_decompiled_code_async(refactored, function_name)
        print(f"[+] Gemini cleanup completed: {function_name}")
    else:
        print(f"[!] Gemini not available, skipping cleanup step")
    
    return refactored


async def refactor_all_functions(
    functions: Dict[str, str],
    gemini_mode: bool = False,
    vertex_mode: bool = False,
) -> Dict[str, str]:
    """
    Refactor all functions in a binary using LLM4Decompile/Vertex AI and Gemini.
    
    Args:
        functions: Dict mapping function names to raw decompiled code
        gemini_mode: If True, use Gemini for refactoring instead of LLM4Decompile
        vertex_mode: If True, use Vertex AI GPU inference instead of local LLM
        
    Returns:
        Dict mapping function names to refactored code
    """
    refactored = {}
    
    for name, code in functions.items():
        refactored[name] = await refactor_code(
            name, code, gemini_mode=gemini_mode, vertex_mode=vertex_mode
        )
    
    return refactored
