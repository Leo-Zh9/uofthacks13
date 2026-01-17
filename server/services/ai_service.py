"""
AI Service for two-stage code refactoring pipeline.

Stage 1: LLM4Decompile - Convert Ghidra pseudo-code to correct, compilable C
Stage 2: GPT-4o - Improve readability with meaningful variable names and comments

This combines the specialized decompilation capabilities of LLM4Decompile
with the general language understanding of GPT-4o for best results.
"""

import os
from typing import Dict, Optional, Tuple
from openai import OpenAI

# Import LLM4Decompile service
from services.llm_service import decompile_to_c, is_available as llm4decompile_available, mock_decompile_to_c

# Initialize OpenAI client for Stage 2
client: Optional[OpenAI] = None

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY)
    print("[+] OpenAI API configured for Stage 2 (readability)")
else:
    print("[!] OPENAI_API_KEY not set - Stage 2 (readability) will be skipped")


# Stage 2 prompt - simpler since we're working with clean C code
READABILITY_PROMPT = """You are improving decompiled C code for readability.
The code is already syntactically correct - DO NOT change any logic or behavior.

Your task:
1. Rename variables based on their usage:
   - local_10, local_14 → descriptive names like buffer_size, loop_index
   - param_1, param_2 → descriptive names like input_string, array_length
   - Analyze HOW the variable is used to determine its purpose

2. Add brief comments explaining:
   - What the function does (as a docstring at the top)
   - Non-obvious logic or algorithms
   - Purpose of important variables

3. Improve formatting:
   - Consistent indentation
   - Logical grouping of related operations

CRITICAL RULES:
- Do NOT change ANY logic or behavior
- Do NOT add or remove any operations
- Do NOT change function signatures (keep original parameter names in signature if needed)
- Output ONLY valid C code with no markdown formatting or code fences

Output the improved C code directly."""


async def refactor_code(
    function_name: str,
    raw_code: str,
    context_functions: Optional[Dict[str, str]] = None
) -> str:
    """
    Two-stage refactoring pipeline for decompiled code.
    
    Stage 1: LLM4Decompile for semantic correctness
    Stage 2: GPT-4o for readability (if API key available)
    
    Args:
        function_name: Name of the function being refactored
        raw_code: Raw decompiled C code from Ghidra
        context_functions: Optional dict of other function signatures for context
        
    Returns:
        Refactored C code (correct and readable)
    """
    # Stage 1: LLM4Decompile for correctness
    print(f"[*] Stage 1: Processing {function_name} with LLM4Decompile...")
    
    if llm4decompile_available():
        correct_c = decompile_to_c(raw_code)
        print(f"[+] Stage 1 complete: {function_name}")
    else:
        # Use mock decompilation if LLM4Decompile not available
        print(f"[!] LLM4Decompile not available, using mock transformation")
        correct_c = mock_decompile_to_c(raw_code)
    
    # Stage 2: GPT-4o for readability (if API key available)
    if client:
        print(f"[*] Stage 2: Improving readability for {function_name} with GPT-4o...")
        readable_c = await _improve_readability(function_name, correct_c, context_functions)
        print(f"[+] Stage 2 complete: {function_name}")
        return readable_c
    else:
        # No API key - return Stage 1 output with basic mock improvements
        print(f"[!] No OpenAI API key - returning Stage 1 output only")
        return _mock_readability(function_name, correct_c)
    

async def _improve_readability(
    function_name: str,
    code: str,
    context_functions: Optional[Dict[str, str]] = None
) -> str:
    """
    Stage 2: Use GPT-4o to improve code readability.
    
    This works on already-correct C code from Stage 1,
    so it's faster and more accurate than working on raw Ghidra output.
    """
    user_prompt = f"Improve the readability of this decompiled function:\n\n{code}"
    
    # Add context about other functions if available
    if context_functions:
        context_str = "\n".join([
            f"// {name}: {sig}" 
            for name, sig in list(context_functions.items())[:5]  # Limit context
        ])
        user_prompt += f"\n\nOther functions in this binary:\n{context_str}"
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": READABILITY_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,  # Low temperature for consistent output
            max_tokens=4096,
        )
        
        result = response.choices[0].message.content
        
        # Clean up any accidental markdown code fences
        if result.startswith("```"):
            lines = result.split("\n")
            lines = lines[1:]  # Remove opening fence
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]  # Remove closing fence
            result = "\n".join(lines)
        
        return result.strip()
        
    except Exception as e:
        print(f"[!] Error in Stage 2 (GPT-4o): {e}")
        # Return Stage 1 output on failure
        return code


def _mock_readability(function_name: str, code: str) -> str:
    """
    Mock readability improvements when no API key is available.
    Performs basic transformations to simulate Stage 2 output.
    """
    refactored = code
    
    # Add a header comment
    header = f"""/**
 * Function: {function_name}
 * 
 * [Decompiled and refactored code]
 * Stage 1: LLM4Decompile - structural fixes
 * Stage 2: Skipped (no API key)
 */
"""
    
    # Basic variable renaming patterns
    replacements = [
        ("iVar1", "index"),
        ("iVar2", "counter"),
        ("uVar2", "result"),
        ("uVar3", "return_value"),
        ("param_1", "input"),
        ("param_2", "size"),
        ("pcVar3", "message"),
        ("pvVar2", "buffer"),
        ("pvVar3", "ptr"),
        ("lVar1", "total"),
        ("lVar3", "offset"),
        ("lVar4", "computed_value"),
        ("sVar1", "string_length"),
        ("local_10", "local_var_a"),
        ("local_14", "local_var_b"),
        ("local_18", "local_var_c"),
    ]
    
    for old, new in replacements:
        refactored = refactored.replace(old, new)
    
    return header + refactored


async def refactor_all_functions(functions: Dict[str, str]) -> Dict[str, str]:
    """
    Refactor all functions in a binary using the two-stage pipeline.
    
    Args:
        functions: Dict mapping function names to raw decompiled code
        
    Returns:
        Dict mapping function names to refactored code
    """
    refactored = {}
    
    # Get function signatures for context
    signatures = {
        name: code.split("{")[0].strip() + ";" 
        for name, code in functions.items()
    }
    
    for name, code in functions.items():
        # Provide other function signatures as context
        context = {k: v for k, v in signatures.items() if k != name}
        refactored[name] = await refactor_code(name, code, context)
    
    return refactored
