"""
AI Service for code refactoring using LLM4Decompile and Gemini.

Uses the LLM4Decompile 1.3B model to refine Ghidra pseudo-C into clean C code,
then uses Gemini to further clean up and simplify the code.
"""

from typing import Dict, Optional

# Import LLM4Decompile service
from services.llm_service import decompile_to_c, is_available as llm4decompile_available, mock_decompile_to_c

# Import Gemini service for code cleanup
from services.gemini_service import (
    cleanup_decompiled_code_async,
    is_available as gemini_available
)


async def refactor_code(
    function_name: str,
    raw_code: str,
    context_functions: Optional[Dict[str, str]] = None
) -> str:
    """
    Refactor decompiled code using LLM4Decompile and Gemini.
    
    Args:
        function_name: Name of the function being refactored
        raw_code: Raw decompiled C code from Ghidra
        context_functions: Optional dict of other function signatures (unused for now)
        
    Returns:
        Refactored and cleaned C code
    """
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


async def refactor_all_functions(functions: Dict[str, str]) -> Dict[str, str]:
    """
    Refactor all functions in a binary using LLM4Decompile and Gemini.
    
    Args:
        functions: Dict mapping function names to raw decompiled code
        
    Returns:
        Dict mapping function names to refactored code
    """
    refactored = {}
    
    for name, code in functions.items():
        refactored[name] = await refactor_code(name, code)
    
    return refactored
