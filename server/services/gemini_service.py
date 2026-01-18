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
from google import genai

# Configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Model for main refactoring (replacing LLM4Decompile) - more capable
GEMINI_REFACTOR_MODEL = "gemini-3-pro-preview"  # Fast and capable for refactoring
# Model for final cleanup pass - fast
GEMINI_CLEANUP_MODEL = "gemini-2.0-flash"  # Fast for cleanup

# Initialize Gemini client
_client = None


def _get_client():
    """Lazy-load the Gemini client."""
    global _client
    if _client is None:
        api_key = GEMINI_API_KEY or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        _client = genai.Client(api_key=api_key)
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
5. **Remove compiler/runtime artifacts** - Delete initialization calls that are compiler-generated, such as:
   - `__main()`, `__libc_start_main()`, `_start()`, `__do_global_ctors()`
   - Any function that just calls another init function with no user logic
6. **Replace obscure functions with readable equivalents**:
   - `puts("text")` → `printf("text\\n")` 
   - `fputs(str, stdout)` → `printf("%s", str)`
   - `putchar(c)` → `printf("%c", c)`
7. **Preserve control flow** - Keep all if/else, switch, loops exactly as-is
8. **Fix obvious decompiler artifacts** - Clean up mangled names, fix parameter order issues
9. **Remove empty/stub functions** - If a function body is just `return;` or empty, remove the call

## Output Format:
- Return ONLY the cleaned C/C++ code
- No markdown, no explanations, no code fences
- Preserve original function signatures (except for removed artifact functions)
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
        
        # Make the API call using new google.genai SDK
        response = client.models.generate_content(
            model=GEMINI_CLEANUP_MODEL,
            contents=CLEANUP_SYSTEM_PROMPT + "\n\n" + user_prompt,
            config={
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
        
        # Make the API call using new google.genai SDK (async)
        response = await client.aio.models.generate_content(
            model=GEMINI_CLEANUP_MODEL,
            contents=CLEANUP_SYSTEM_PROMPT + "\n\n" + user_prompt,
            config={
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


# Prompt for full refactoring (replacing LLM4Decompile)
REFACTOR_SYSTEM_PROMPT = """You are an expert reverse engineer specializing in decompiled code analysis. Your task is to transform raw Ghidra pseudo-C decompiler output into clean, readable, idiomatic C code.

## Your Goals:
1. **Transform pseudo-C to valid C** - Fix syntax issues, type declarations, and decompiler artifacts
2. **Infer meaningful names** - Replace generic names (var1, param_1, uVar2) with descriptive ones based on usage context
3. **Reconstruct data structures** - Identify structs, arrays, and pointer patterns
4. **Simplify expressions** - Convert complex bitwise operations to readable equivalents where possible
5. **Remove compiler artifacts** - Delete `__main()`, `__libc_start_main()`, init stubs
6. **Use standard library properly** - Replace `puts()` with `printf()`, fix format strings
7. **Add clarifying comments** - Explain non-obvious logic, suspected purpose of functions
8. **Fix control flow** - Convert goto-based decompiler output to proper if/else/while/for where possible

## Rules:
- Preserve the EXACT functionality - this is critical
- Output valid, compilable C code
- No markdown formatting, no code fences, just raw C code
- Keep function signatures but improve parameter names
- Handle edge cases gracefully (unknown types → use void* or appropriate generic)

## Context:
This is decompiled code from Ghidra. Variable names like `local_XX`, `param_X`, `uVar`, `iVar` are auto-generated.
Pointer arithmetic and type casts are often overly explicit. Simplify where safe."""


async def refactor_with_gemini_async(code: str, function_name: Optional[str] = None) -> str:
    """
    Refactor decompiled code using Gemini (alternative to LLM4Decompile).
    
    This performs a full refactoring pass, transforming Ghidra pseudo-C into
    clean, readable C code.
    
    Args:
        code: Raw decompiled C/C++ code from Ghidra
        function_name: Optional function name for context
        
    Returns:
        Refactored, readable C code
    """
    if not is_available():
        print("[!] Gemini API key not configured, returning original code")
        return code
    
    try:
        client = _get_client()
        
        # Build the prompt
        context = f"Function: {function_name}\n\n" if function_name else ""
        user_prompt = f"""{context}Refactor this Ghidra decompiler output into clean, readable C code:

{code}"""
        
        # Make the API call using Gemini Pro for refactoring
        response = await client.aio.models.generate_content(
            model=GEMINI_REFACTOR_MODEL,
            contents=REFACTOR_SYSTEM_PROMPT + "\n\n" + user_prompt,
            config={
                "temperature": 0.2,  # Slightly higher for creative naming
                "max_output_tokens": 8192,
            }
        )
        
        refactored_code = response.text.strip()
        
        # Remove any markdown code fences if present
        refactored_code = re.sub(r'^```(?:c|cpp|c\+\+)?\n?', '', refactored_code)
        refactored_code = re.sub(r'\n?```$', '', refactored_code)
        
        return refactored_code.strip()
        
    except Exception as e:
        print(f"[!] Gemini API error: {e}")
        return code


async def refactor_multiple_functions_async(functions: dict[str, str]) -> dict[str, str]:
    """
    Refactor multiple decompiled functions using Gemini.
    
    Args:
        functions: Dict mapping function names to raw decompiled code
        
    Returns:
        Dict mapping function names to refactored code
    """
    refactored = {}
    for name, code in functions.items():
        print(f"[*] Refactoring function with Gemini: {name}")
        refactored[name] = await refactor_with_gemini_async(code, name)
        print(f"[+] Completed: {name}")
    return refactored
