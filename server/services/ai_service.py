"""
AI Service for code refactoring using OpenAI GPT-4o.

This service takes raw decompiled C code and refactors it to be more readable,
with better variable names, proper control flow, and helpful comments.
"""

import os
from typing import Dict, Optional
from openai import OpenAI

# Initialize OpenAI client
client: Optional[OpenAI] = None

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY)


SYSTEM_PROMPT = """You are an expert Reverse Engineer and C programmer. I will provide you with raw decompiled pseudo-code from Ghidra. It contains generic variable names (like iVar1, uVar2, param_1) and often has confusing control flow with goto statements.

Your task is to refactor this code to be more readable:

1. **Variable Renaming**: Analyze the logic and rename variables based on their usage:
   - iVar1 counting in a loop → `index` or `counter`
   - param_1 that's a string → `input_string` or `filename`
   - uVar2 storing a size → `buffer_size` or `length`
   - pvVar that's allocated memory → `buffer` or `allocated_memory`

2. **Control Flow Improvement**: Convert goto statements to proper structured control flow:
   - Replace goto-based loops with `while` or `for` loops
   - Replace goto-based conditionals with proper `if/else` blocks
   - Preserve the exact same logic - only restructure, don't change behavior

3. **Add Comments**: Add brief, helpful comments explaining:
   - What each function does (as a docstring at the top)
   - Complex logic or non-obvious operations
   - Purpose of important variables

4. **Type Clarity**: Use clearer types where appropriate:
   - Replace `undefined` types with appropriate C types
   - Add explicit casts where helpful for clarity

5. **CRITICAL RULES**:
   - Do NOT change the underlying logic or behavior of the code
   - Do NOT add new functionality
   - Do NOT remove any operations, even if they seem unnecessary
   - Keep all function calls intact
   - Output ONLY valid C code with no markdown formatting or code fences

Output the refactored C code directly, with no additional explanation."""


async def refactor_code(
    function_name: str,
    raw_code: str,
    context_functions: Optional[Dict[str, str]] = None
) -> str:
    """
    Refactor a single function's decompiled code using GPT-4o.
    
    Args:
        function_name: Name of the function being refactored
        raw_code: Raw decompiled C code from Ghidra
        context_functions: Optional dict of other function signatures for context
        
    Returns:
        Refactored C code
    """
    if not client:
        # Return mock refactored code if API key not available
        return _mock_refactor(function_name, raw_code)
    
    # Build the user prompt
    user_prompt = f"Please refactor the following decompiled function:\n\n```c\n{raw_code}\n```"
    
    # Add context about other functions if available
    if context_functions:
        context_str = "\n".join([
            f"// {name}: {sig}" 
            for name, sig in list(context_functions.items())[:10]  # Limit context
        ])
        user_prompt += f"\n\nFor context, here are signatures of other functions in this binary:\n{context_str}"
    
    try:
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,  # Lower temperature for more consistent output
            max_tokens=4096,
        )
        
        refactored = response.choices[0].message.content
        
        # Clean up any accidental markdown code fences
        if refactored.startswith("```"):
            lines = refactored.split("\n")
            # Remove first line (```c or ```)
            lines = lines[1:]
            # Remove last line if it's ```
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            refactored = "\n".join(lines)
        
        return refactored.strip()
        
    except Exception as e:
        print(f"[!] Error calling OpenAI API: {e}")
        # Return original code with a comment on failure
        return f"/* AI refactoring failed: {str(e)} */\n{raw_code}"


def _mock_refactor(function_name: str, raw_code: str) -> str:
    """
    Mock refactoring for development/testing without API key.
    Performs basic transformations.
    """
    # Simple mock transformations
    refactored = raw_code
    
    # Add a header comment
    header = f"""/**
 * Function: {function_name}
 * 
 * [AI-refactored code - mock mode]
 * This code has been analyzed and improved for readability.
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
    ]
    
    for old, new in replacements:
        refactored = refactored.replace(old, new)
    
    # Replace goto patterns with comments suggesting structure
    if "goto LAB_" in refactored:
        refactored = refactored.replace("goto LAB_", "/* TODO: restructure */ goto LAB_")
    
    # Replace undefined types
    refactored = refactored.replace("undefined8", "uint64_t")
    refactored = refactored.replace("undefined4", "uint32_t")
    refactored = refactored.replace("undefined", "uint8_t")
    
    return header + refactored


async def refactor_all_functions(functions: Dict[str, str]) -> Dict[str, str]:
    """
    Refactor all functions in a binary.
    
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
