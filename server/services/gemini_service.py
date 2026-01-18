"""
Gemini Service for cleaning up and simplifying decompiled code.

Uses Google's Gemini 2.0 Flash model to make decompiled code more human-readable by:
- Removing unused/redundant variables
- Simplifying variable names
- Cleaning up unnecessary code patterns
- Improving overall code structure
"""

import os
import re
from typing import Optional
import google.generativeai as genai

# Configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.0-flash"

# Initialize Gemini
_client = None


def _get_client():
    """Lazy-load the Gemini client."""
    global _client
    if _client is None:
        api_key = GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        genai.configure(api_key=api_key)
        _client = genai.GenerativeModel(GEMINI_MODEL)
    return _client


def is_available() -> bool:
    """Check if Gemini service is available."""
    return bool(GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY"))


# Carefully engineered prompt for decompiled code cleanup
CLEANUP_SYSTEM_PROMPT = """You are an expert reverse engineer and C/C++ code optimizer. Your task is to clean up decompiled code to make it human-readable while preserving exact functionality.

## Rules (STRICT):
1. **Preserve all functional logic** - Never change what the code does
2. **Remove dead code** - Delete unused variables, redundant assignments, unreachable code
3. **Simplify variable names** - Use descriptive names (e.g., `str_bodyttttt` → `emailBody`)
4. **Collapse redundant copies** - Chains like `a=b; c=a; d=c;` become `d=b;`
5. **Keep all API calls** - Never remove function calls that have side effects
6. **Preserve control flow** - Keep all if/else, switch, loops exactly as-is
7. **Fix obvious decompiler artifacts** - Clean up mangled names, fix parameter order issues

## Output Format:
- Return ONLY the cleaned C/C++ code
- No markdown, no explanations, no code fences
- Preserve original function signatures
- Add brief inline comments only where logic is non-obvious"""


def cleanup_decompiled_code(code: str, function_name: Optional[str] = None) -> str:
    """
    Clean up decompiled code using Gemini to make it more human-readable.
    
    Args:
        code: Raw decompiled C/C++ code
        function_name: Optional function name for context
        
    Returns:
        Cleaned up, human-readable code
    """
    if not is_available():
        print("[!] Gemini API key not configured, returning original code")
        return code
    
    try:
        client = _get_client()
        
        # Build the prompt
        context = f"Function: {function_name}\n\n" if function_name else ""
        user_prompt = f"""{context}Clean up this decompiled code. Remove unused variables, simplify names, collapse redundant assignments:

{code}"""
        
        # Make the API call
        response = client.generate_content(
            contents=[
                {"role": "user", "parts": [{"text": CLEANUP_SYSTEM_PROMPT + "\n\n" + user_prompt}]}
            ],
            generation_config={
                "temperature": 0.1,  # Low temperature for consistent, deterministic output
                "max_output_tokens": 8192,
            }
        )
        
        cleaned_code = response.text.strip()
        
        # Remove any markdown code fences if present
        cleaned_code = re.sub(r'^```(?:c|cpp|c\+\+)?\n?', '', cleaned_code)
        cleaned_code = re.sub(r'\n?```$', '', cleaned_code)
        
        return cleaned_code.strip()
        
    except Exception as e:
        print(f"[!] Gemini API error: {e}")
        return code  # Return original on error


async def cleanup_decompiled_code_async(code: str, function_name: Optional[str] = None) -> str:
    """
    Async version of cleanup_decompiled_code.
    
    Args:
        code: Raw decompiled C/C++ code
        function_name: Optional function name for context
        
    Returns:
        Cleaned up, human-readable code
    """
    if not is_available():
        print("[!] Gemini API key not configured, returning original code")
        return code
    
    try:
        client = _get_client()
        
        # Build the prompt
        context = f"Function: {function_name}\n\n" if function_name else ""
        user_prompt = f"""{context}Clean up this decompiled code. Remove unused variables, simplify names, collapse redundant assignments:

{code}"""
        
        # Make the API call (async)
        response = await client.generate_content_async(
            contents=[
                {"role": "user", "parts": [{"text": CLEANUP_SYSTEM_PROMPT + "\n\n" + user_prompt}]}
            ],
            generation_config={
                "temperature": 0.1,
                "max_output_tokens": 8192,
            }
        )
        
        cleaned_code = response.text.strip()
        
        # Remove any markdown code fences if present
        cleaned_code = re.sub(r'^```(?:c|cpp|c\+\+)?\n?', '', cleaned_code)
        cleaned_code = re.sub(r'\n?```$', '', cleaned_code)
        
        return cleaned_code.strip()
        
    except Exception as e:
        print(f"[!] Gemini API error: {e}")
        return code


def cleanup_multiple_functions(functions: dict[str, str]) -> dict[str, str]:
    """
    Clean up multiple decompiled functions.
    
    Args:
        functions: Dict mapping function names to decompiled code
        
    Returns:
        Dict mapping function names to cleaned code
    """
    cleaned = {}
    for name, code in functions.items():
        print(f"[*] Cleaning up function: {name}")
        cleaned[name] = cleanup_decompiled_code(code, name)
        print(f"[+] Completed: {name}")
    return cleaned


async def cleanup_multiple_functions_async(functions: dict[str, str]) -> dict[str, str]:
    """
    Async version - clean up multiple decompiled functions.
    
    Args:
        functions: Dict mapping function names to decompiled code
        
    Returns:
        Dict mapping function names to cleaned code
    """
    cleaned = {}
    for name, code in functions.items():
        print(f"[*] Cleaning up function: {name}")
        cleaned[name] = await cleanup_decompiled_code_async(code, name)
        print(f"[+] Completed: {name}")
    return cleaned
