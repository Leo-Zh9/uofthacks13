"""
AI Service for code refactoring using LLM4Decompile.

Uses the LLM4Decompile 1.3B model to refine Ghidra pseudo-C into clean C code.
"""

from typing import Dict, Optional

# Import LLM4Decompile service
from services.llm_service import decompile_to_c, is_available as llm4decompile_available, mock_decompile_to_c


async def refactor_code(
    function_name: str,
    raw_code: str,
    context_functions: Optional[Dict[str, str]] = None
) -> str:
    """
    Refactor decompiled code using LLM4Decompile.
    
    Args:
        function_name: Name of the function being refactored
        raw_code: Raw decompiled C code from Ghidra
        context_functions: Optional dict of other function signatures (unused for now)
        
    Returns:
        Refactored C code
    """
    print(f"[*] Processing {function_name} with LLM4Decompile...")
    
    if llm4decompile_available():
        refactored = decompile_to_c(raw_code)
        print(f"[+] Completed: {function_name}")
        return refactored
    else:
        # Use mock transformation if LLM4Decompile not available
        print(f"[!] LLM4Decompile not available, using mock transformation")
        return mock_decompile_to_c(raw_code)


async def refactor_all_functions(functions: Dict[str, str]) -> Dict[str, str]:
    """
    Refactor all functions in a binary using LLM4Decompile.
    
    Args:
        functions: Dict mapping function names to raw decompiled code
        
    Returns:
        Dict mapping function names to refactored code
    """
    refactored = {}
    
    for name, code in functions.items():
        refactored[name] = await refactor_code(name, code)
    
    return refactored
