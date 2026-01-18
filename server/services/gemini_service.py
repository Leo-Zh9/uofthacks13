"""
Gemini Service for two-pass code refactoring.

Two-Pass Refactoring Pipeline:
- Pass 1 (Gemini 3 Pro): Logic correction, control flow reconstruction, structure fixing
- Pass 2 (Gemini 3 Flash): Variable naming, readability improvements, cleanup

This replaces the previous LLM4Decompile model for faster, higher-quality results.
"""

import os
import re
from typing import Optional
from google import genai

# Configuration
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")

# Pass 1: Gemini 3 Pro for logic/structure refactoring
GEMINI_REFACTOR_MODEL = "gemini-3-pro-preview"

# Pass 2: Gemini Flash for variable naming/readability cleanup
GEMINI_CLEANUP_MODEL = "gemini-2.0-flash"  # Using 2.0-flash (fast and stable)

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


def _clean_markdown_artifacts(code: str) -> str:
    """
    Remove markdown code fences and other artifacts from Gemini output.
    Handles various formats like ```c, ```cpp, ```c++, or just ``` or ++.
    """
    result = code.strip()
    
    # Remove opening code fence with optional language tag
    # Handles: ```c, ```cpp, ```c++, ```, ```C, etc.
    result = re.sub(r'^```(?:c(?:pp|\+\+)?|C(?:PP|\+\+)?)?\s*\n?', '', result, flags=re.IGNORECASE)
    
    # Remove closing code fence
    result = re.sub(r'\n?```\s*$', '', result)
    
    # Remove standalone language tags at the start (e.g., "c++" or "cpp" on first line)
    result = re.sub(r'^(?:c\+\+|cpp|c)\s*\n', '', result, flags=re.IGNORECASE)
    
    # Remove just "++" at the start of the file (common Gemini artifact)
    result = re.sub(r'^\+\+\s*\n?', '', result)
    
    # Remove any leading/trailing whitespace
    return result.strip()


# Carefully engineered prompt for decompiled code cleanup
# This is Pass 2: Focus on variable naming, comments, and readability
CLEANUP_SYSTEM_PROMPT = """You are an expert reverse engineer making decompiled code HIGHLY READABLE for security analysis. Your job is to transform cryptic decompiled code into clean, well-documented code.

## Your PRIMARY Goals:

### 1. AGGRESSIVE Variable Renaming (Most Important!)
Transform ALL generic/cryptic names into meaningful ones:
- `local_10`, `local_8`, `local_c` → `buffer`, `inputLength`, `loopCounter`, `fileDescriptor`
- `param_1`, `param_2` → `fileName`, `bufferSize`, `inputString`, `sockfd`
- `uVar1`, `iVar2` → `returnValue`, `bytesRead`, `errorCode`, `arrayIndex`
- `DAT_00104000` → `globalBuffer`, `configData`, `staticString`
- Single letter vars → descriptive names based on context

### 2. Comprehensive Comments
Add comments explaining:
- What each function does (brief summary at top)
- What each significant code block does
- Non-obvious operations (bit manipulation, pointer arithmetic)
- Loop purposes
- Conditional logic reasoning

### 3. Function Name Improvement
If function names are generic (like `FUN_00101234`), suggest a better name as a comment.

### 4. Code Cleanup
- Remove truly unused variables
- Fix inconsistent spacing/indentation
- Group related variable declarations

## Rules:
- PRESERVE the exact functionality - code must do the same thing
- Keep all library calls (printf, malloc, etc.) exactly as written
- Keep control flow structure (if/else/while/for) intact
- Do NOT add new functionality

## Output Format:
Return ONLY the cleaned C/C++ code. No markdown code fences, no explanations outside comments."""


def cleanup_decompiled_code(code: str, function_name: Optional[str] = None) -> str:
    """
    Clean up decompiled code using Gemini to make it more human-readable.
    
    Args:
        code: Raw decompiled C/C++ code (can be multiple functions)
        function_name: Optional function name for context
        
    Returns:
        Cleaned up, human-readable code with renamed variables and comments
    """
    if not is_available():
        print("[!] Gemini API key not configured, returning original code")
        return code
    
    try:
        client = _get_client()
        
        # Build the prompt with explicit instructions for aggressive cleanup
        context = f"Primary function: {function_name}\n\n" if function_name else ""
        user_prompt = f"""{context}Transform this decompiled code into HIGHLY READABLE code:

REQUIREMENTS:
1. RENAME ALL cryptic variables to descriptive names:
   - local_X, param_X, uVarX, iVarX → meaningful names based on usage
   - Example: local_10 that holds a string → inputBuffer, local_8 used as counter → loopIndex
2. ADD COMMENTS explaining what each function and code block does
3. Add a summary comment at the top of each function
4. Fix formatting and indentation

CODE TO CLEAN UP:

{code}"""
        
        # Make the API call using new google.genai SDK
        # Higher temperature (0.7) for more creative renaming and comments
        response = client.models.generate_content(
            model=GEMINI_CLEANUP_MODEL,
            contents=CLEANUP_SYSTEM_PROMPT + "\n\n" + user_prompt,
            config={
                "temperature": 0.7,
                "max_output_tokens": 16384,
            }
        )
        
        cleaned_code = response.text.strip()
        
        # Remove any markdown code fences and artifacts
        cleaned_code = _clean_markdown_artifacts(cleaned_code)
        
        return cleaned_code.strip()
        
    except Exception as e:
        print(f"[!] Gemini API error: {e}")
        return code  # Return original on error


async def cleanup_decompiled_code_async(code: str, function_name: Optional[str] = None) -> str:
    """
    Async version of cleanup_decompiled_code.
    
    Args:
        code: Raw decompiled C/C++ code (can be multiple functions)
        function_name: Optional function name for context
        
    Returns:
        Cleaned up, human-readable code with renamed variables and comments
    """
    if not is_available():
        print("[!] Gemini API key not configured, returning original code")
        return code
    
    try:
        client = _get_client()
        
        # Build the prompt with explicit instructions for aggressive cleanup
        context = f"Primary function: {function_name}\n\n" if function_name else ""
        user_prompt = f"""{context}Transform this decompiled code into HIGHLY READABLE code:

REQUIREMENTS:
1. RENAME ALL cryptic variables to descriptive names:
   - local_X, param_X, uVarX, iVarX → meaningful names based on usage
   - Example: local_10 that holds a string → inputBuffer, local_8 used as counter → loopIndex
2. ADD COMMENTS explaining what each function and code block does
3. Add a summary comment at the top of each function
4. Fix formatting and indentation

CODE TO CLEAN UP:

{code}"""
        
        # Make the API call using new google.genai SDK (async)
        # Higher temperature (0.7) for more creative renaming and comments
        response = await client.aio.models.generate_content(
            model=GEMINI_CLEANUP_MODEL,
            contents=CLEANUP_SYSTEM_PROMPT + "\n\n" + user_prompt,
            config={
                "temperature": 0.7,
                "max_output_tokens": 16384,
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
# This is Pass 1: Focus on logic correction and structure, NOT variable naming
REFACTOR_SYSTEM_PROMPT = """You are an expert reverse engineer specializing in decompiled code analysis. Your task is to transform raw Ghidra pseudo-C decompiler output into clean, correct C code.

## CRITICAL RULES - Standard Library Functions:
- NEVER implement, expand, or rewrite standard library functions (malloc, free, printf, strlen, memcpy, etc.)
- NEVER add function prototypes or implementations for standard library functions
- Keep ALL library function CALLS exactly as they appear in the original code
- Do NOT add #include statements
- Only refactor the USER-WRITTEN function body logic

## Your Goals (in order of priority):
1. **Fix decompiler artifacts** - Correct syntax issues, broken control flow, incorrect types
2. **Reconstruct control flow** - Convert goto-based output to proper if/else/while/for where safe
3. **Identify data structures** - Recognize struct access patterns, arrays, pointer arithmetic
4. **Simplify expressions** - Convert complex bitwise operations to readable equivalents where safe
5. **Remove compiler-generated code** - Delete `__main()`, `__libc_start_main()`, init stubs if present in body

## What NOT to do:
- Do NOT rename variables yet (that's done in a separate pass)
- Do NOT change library function calls (e.g., don't change puts() to printf())
- Do NOT add comments yet
- Do NOT add any code that wasn't in the original
- Do NOT implement missing functions

## Output Format:
- Output ONLY valid C code
- No markdown formatting, no code fences, no explanations
- Preserve original function signature exactly
- If a function is just a library wrapper, return it unchanged

## Context:
This is decompiled code from Ghidra. Variable names like `local_XX`, `param_X`, `uVar`, `iVar` are auto-generated.
The code may have overly explicit casts and pointer arithmetic - simplify only where safe to do so."""


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
        # Temperature 0.7 for logical changes while maintaining correctness
        response = await client.aio.models.generate_content(
            model=GEMINI_REFACTOR_MODEL,
            contents=REFACTOR_SYSTEM_PROMPT + "\n\n" + user_prompt,
            config={
                "temperature": 0.7,
                "max_output_tokens": 16384,
            }
        )
        
        refactored_code = response.text.strip()
        
        # Remove any markdown code fences and language tags
        refactored_code = _clean_markdown_artifacts(refactored_code)
        
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


# Malware detection prompt
MALWARE_DETECTION_PROMPT = """You are a cybersecurity expert analyzing decompiled code for malware indicators.

Analyze the following decompiled C/C++ code and determine if it exhibits malicious behavior.

## Malware Indicators to Look For:
- Keylogging (keyboard hooks, GetAsyncKeyState, logging keystrokes to files)
- Screen capture / screenshot functionality
- Network exfiltration (sending data to remote servers)
- File encryption (ransomware patterns)
- Process injection / DLL injection
- Registry manipulation for persistence
- Credential theft (reading browser data, password files)
- Backdoor / remote access functionality
- Disabling security software
- Data destruction / wiping
- Cryptocurrency mining
- Botnet communication patterns
- Privilege escalation attempts

## Response Format:
Respond with ONLY a JSON object (no markdown, no explanation):
{
  "is_malware": true/false,
  "confidence": "high"/"medium"/"low",
  "threats": ["threat1", "threat2"],
  "explanation": "Brief explanation of findings"
}

If the code is benign or you cannot determine malicious intent, set is_malware to false."""


async def analyze_for_malware_async(combined_code: str) -> dict:
    """
    Analyze decompiled code for malware indicators using Gemini Flash.
    
    Args:
        combined_code: Combined decompiled code from all functions
        
    Returns:
        Dict with: is_malware (bool), confidence (str), threats (list), explanation (str)
    """
    if not is_available():
        print("[!] Gemini API key not configured, skipping malware analysis")
        return {"is_malware": False, "confidence": "low", "threats": [], "explanation": "Analysis unavailable"}
    
    try:
        client = _get_client()
        
        # Truncate very long code to stay within limits
        max_chars = 50000
        if len(combined_code) > max_chars:
            combined_code = combined_code[:max_chars] + "\n// ... (truncated)"
        
        user_prompt = f"""Analyze this decompiled code for malware:

{combined_code}"""
        
        response = await client.aio.models.generate_content(
            model=GEMINI_CLEANUP_MODEL,  # Use Flash for speed
            contents=MALWARE_DETECTION_PROMPT + "\n\n" + user_prompt,
            config={
                "temperature": 0.1,
                "max_output_tokens": 1024,
            }
        )
        
        result_text = response.text.strip()
        
        # Parse JSON response
        import json
        # Remove markdown code fences if present
        result_text = re.sub(r'^```(?:json)?\n?', '', result_text)
        result_text = re.sub(r'\n?```$', '', result_text)
        
        try:
            result = json.loads(result_text)
            print(f"[*] Malware analysis result: is_malware={result.get('is_malware')}, confidence={result.get('confidence')}")
            return result
        except json.JSONDecodeError:
            print(f"[!] Failed to parse malware analysis response: {result_text[:200]}")
            return {"is_malware": False, "confidence": "low", "threats": [], "explanation": "Failed to parse analysis"}
        
    except Exception as e:
        print(f"[!] Gemini API error during malware analysis: {e}")
        return {"is_malware": False, "confidence": "low", "threats": [], "explanation": f"Analysis error: {str(e)}"}
