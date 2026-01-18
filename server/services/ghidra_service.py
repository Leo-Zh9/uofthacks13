"""
PyGhidra integration service for binary decompilation.

This service uses the new PyGhidra API to analyze and decompile binary files.
Requires:
- Java 17+ installed
- Ghidra installed with GHIDRA_INSTALL_DIR environment variable set
"""

import os
import shutil
from typing import Dict, Optional, Set

# Check if Ghidra is properly configured
GHIDRA_INSTALL_DIR = os.environ.get("GHIDRA_INSTALL_DIR")
GHIDRA_AVAILABLE = False
_ghidra_started = False

# Common library functions to SKIP (these are not user-written)
LIBRARY_FUNCTIONS: Set[str] = {
    # C standard library
    "malloc", "free", "calloc", "realloc",
    "printf", "fprintf", "sprintf", "snprintf", "vprintf", "vfprintf",
    "scanf", "fscanf", "sscanf",
    "fopen", "fclose", "fread", "fwrite", "fseek", "ftell", "fflush",
    "fgets", "fputs", "fgetc", "fputc", "getc", "putc", "getchar", "putchar",
    "strlen", "strcpy", "strncpy", "strcat", "strncat", "strcmp", "strncmp",
    "strchr", "strrchr", "strstr", "strtok", "strdup",
    "memcpy", "memmove", "memset", "memcmp", "memchr",
    "atoi", "atol", "atof", "strtol", "strtoul", "strtod",
    "abs", "labs", "rand", "srand",
    "exit", "abort", "atexit", "_exit",
    "isalpha", "isdigit", "isalnum", "isspace", "isupper", "islower",
    "toupper", "tolower",
    "time", "clock", "difftime", "mktime", "localtime", "gmtime",
    "qsort", "bsearch",
    # Windows API
    "GetLastError", "SetLastError", "GetModuleHandle", "GetProcAddress",
    "LoadLibrary", "FreeLibrary", "GetModuleFileName",
    "CreateFile", "ReadFile", "WriteFile", "CloseHandle",
    "VirtualAlloc", "VirtualFree", "VirtualProtect",
    "HeapAlloc", "HeapFree", "HeapReAlloc",
    "GetProcessHeap", "GetCurrentProcess", "GetCurrentThread",
    "ExitProcess", "TerminateProcess",
    "MessageBox", "MessageBoxA", "MessageBoxW",
    # MSVC runtime
    "__security_check_cookie", "__security_init_cookie",
    "__GSHandlerCheck", "__CxxFrameHandler3", "__CxxFrameHandler4",
    "_initterm", "_initterm_e", "__acrt_iob_func",
    "_cexit", "_c_exit", "_exit", "__p___argc", "__p___argv",
    # Compiler-generated / linker stubs
    "_start", "__libc_start_main", "__gmon_start__",
    "__cxa_atexit", "__cxa_finalize",
    "_fini", "_init",
    # MinGW CRT (C Runtime) functions - NOT user code!
    "WinMainCRTStartup", "mainCRTStartup", "wmainCRTStartup", "wWinMainCRTStartup",
    "__tmainCRTStartup", "__wgetmainargs", "__getmainargs",
    "__main", "__do_global_dtors", "__do_global_ctors",
    "atexit", "__gcc_register_frame", "__gcc_deregister_frame",
    "mark_section_writable", "restore_modified_sections",
    "mingw_set_invalid_parameter_handler", "mingw_get_invalid_parameter_handler",
    "_matherr", "mingw_matherr", "__mingw_raise_matherr",
    "__mingw_GetSectionForAddress", "__mingw_GetSectionCount",
    "_pei386_runtime_relocator", "__mingw_init_ehandler",
    "_gnu_exception_handler", "__mingwInitEhandler",
    # GCC exception handling
    "_Unwind_Resume", "_Unwind_RaiseException", "_Unwind_GetIP",
    "__gxx_personality_v0", "__cxa_begin_catch", "__cxa_end_catch",
    "__cxa_throw", "__cxa_rethrow", "__cxa_allocate_exception",
    # Common short helper/comparison functions (STL/operator overloads)
    "empty", "size", "length", "capacity", "begin", "end", "cbegin", "cend",
    "rbegin", "rend", "front", "back", "data", "clear", "erase", "insert",
    "push_back", "pop_back", "push_front", "pop_front", "resize", "reserve",
    "swap", "assign", "at", "get", "set", "find", "count", "contains",
    # Comparison operators (demangled names)
    "eq", "ne", "lt", "gt", "le", "ge",
    "equal", "not_equal", "less", "greater", "less_equal", "greater_equal",
    # Iterator functions
    "next", "prev", "advance", "distance",
    # Smart pointer operations
    "reset", "release", "get_deleter", "use_count", "unique", "expired", "lock",
    # Type traits / metaprogramming stubs
    "type", "value_type", "pointer", "reference", "iterator", "const_iterator",
    # Memory allocation/deallocation (STL allocators)
    "allocate", "deallocate", "construct", "destroy", "get_allocator",
    "allocator", "rebind", "max_size",
    # String operations (std::string methods)
    "c_str", "substr", "append", "replace", "compare", "rfind", "find_first_of",
    "find_last_of", "find_first_not_of", "find_last_not_of", "npos",
    # Move/copy semantics
    "copy", "move", "forward", "move_if_noexcept",
    "copy_n", "copy_backward", "move_backward",
    # Other STL internals
    "emplace", "emplace_back", "emplace_front", "emplace_hint",
    "shrink_to_fit", "bucket_count", "load_factor", "max_load_factor",
    "hash_function", "key_eq", "key_comp", "value_comp",
}

# Only try to use PyGhidra if GHIDRA_INSTALL_DIR is set
if GHIDRA_INSTALL_DIR and os.path.exists(GHIDRA_INSTALL_DIR):
    try:
        import pyghidra
        GHIDRA_AVAILABLE = True
        print(f"[+] Ghidra found at: {GHIDRA_INSTALL_DIR}")
    except ImportError:
        print("[!] PyGhidra not installed. Using mock decompiler for development.")
else:
    if GHIDRA_INSTALL_DIR:
        print(f"[!] GHIDRA_INSTALL_DIR set but path does not exist: {GHIDRA_INSTALL_DIR}")
    else:
        print("[!] GHIDRA_INSTALL_DIR not set. Using mock decompiler for demo mode.")
    print("[*] To enable real decompilation, install Ghidra and set GHIDRA_INSTALL_DIR environment variable.")


# Project directory for Ghidra projects
PROJECT_DIR = os.environ.get("GHIDRA_PROJECT_DIR", os.path.join(os.path.dirname(__file__), "..", "..", "ghidra_projects"))


def ensure_project_dir():
    """Ensure the project directory exists."""
    os.makedirs(PROJECT_DIR, exist_ok=True)


def start_ghidra():
    """Initialize PyGhidra JVM (only once)."""
    global _ghidra_started
    if GHIDRA_AVAILABLE and not _ghidra_started:
        import pyghidra
        if not pyghidra.started():
            pyghidra.start(verbose=True)
            _ghidra_started = True


def is_user_function(func, func_name: str) -> bool:
    """
    Determine if a function is likely written by the developer (not a library function).
    
    Returns True for user functions, False for library/runtime functions.
    
    Environment variables:
    - SKIP_FUN_FUNCTIONS: Set to "true" to skip ALL FUN_* functions (faster for demos)
    - MIN_FUNCTION_SIZE: Minimum bytes for FUN_* functions (default 50)
    """
    # ALWAYS keep main, _main, wmain, WinMain - these are user entry points!
    priority_names = ["main", "_main", "wmain", "_wmain", "winmain", "_winmain", "wwinmain"]
    if func_name.lower() in priority_names:
        return True
    
    # Skip external and thunk functions
    if func.isExternal() or func.isThunk():
        return False
    
    # Optional: Skip ALL FUN_* functions for faster processing
    skip_all_fun = os.environ.get("SKIP_FUN_FUNCTIONS", "").lower() in ("true", "1", "yes")
    if skip_all_fun and func_name.startswith("FUN_"):
        return False
    
    # Skip known library function names
    if func_name.lower() in {f.lower() for f in LIBRARY_FUNCTIONS}:
        return False
    
    # Skip runtime functions by prefix patterns
    runtime_prefixes = [
        # MSVC runtime
        "__scrt_", "__acrt_", "__vcrt_", "__std_", "__crt_",
        "_CRT_", "_RTC_", "__security_", "__report_", "__raise_",
        "FID_conflict:", "_guard_", "__GSHandler", "__CxxFrame",
        # MinGW runtime
        "__mingw_", "_mingw_", "mingw_", "__gnu_",
        "__do_global_", "__gcc_", "_Unwind_", "__gxx_",
        "__cxa_", "_pei386_",
        # GCC internals
        "__register_frame", "__deregister_frame",
    ]
    for prefix in runtime_prefixes:
        if func_name.startswith(prefix):
            return False
    
    # Skip CRT entry points (case-insensitive patterns)
    crt_patterns = [
        "crtStartup", "CRTStartup", "mainCRT", "WinMainCRT",
        "tmainCRT", "wmainCRT", "dllmain", "DllMain",
    ]
    func_lower = func_name.lower()
    for pattern in crt_patterns:
        if pattern.lower() in func_lower:
            return False
    
    # Skip functions starting with double underscore (compiler-generated)
    if func_name.startswith("__"):
        return False
    
    # Skip C++ STL / standard library template instantiations
    stl_patterns = [
        "std::", "operator", "basic_string", "basic_ostream", "basic_istream",
        "basic_ios", "basic_streambuf", "basic_filebuf", "basic_fstream",
        "allocator<", "vector<", "list<", "map<", "set<", "unordered_",
        "unique_ptr<", "shared_ptr<", "weak_ptr<", "make_unique", "make_shared",
        "pair<", "tuple<", "optional<", "variant<", "any<",
        "iterator<", "reverse_iterator", "back_insert_iterator",
        "char_traits<", "collate<", "ctype<", "codecvt<",
        "numpunct<", "moneypunct<", "time_get<", "time_put<",
        "messages<", "money_get<", "money_put<", "num_get<", "num_put<",
        "_Tidy_guard<", "_Alloc_", "_String_", "_Vector_", "_Tree_",
        "locale::", "facet::", "ios_base::", "streambuf::",
        # MSVC STL internals
        "_Narrow_char_traits", "_Char_traits_base", "_String_alloc",
        "_Compressed_pair", "_Vector_alloc", "_List_alloc",
        # GNU C++ extensions
        "__gnu_cxx::", "__gnu_cxx", "char_traits",
        # Additional STL internal patterns
        "__ptr_traits", "__alloc_traits", "__iterator_traits",
        "pointer_to", "addressof", "construct_at", "destroy_at",
        "allocator_traits", "uses_allocator",
    ]
    for pattern in stl_patterns:
        if pattern in func_name:
            return False
    
    # Also check if function name starts with "std::" (may have comment header)
    if func_name.strip().startswith("std::"):
        return False
    
    # Skip C++ destructors and constructors (usually not interesting)
    if func_name.startswith("~") or func_name.endswith("::~"):
        return False
    
    # Skip very short function names (1-2 chars) that are likely operators or helpers
    # But keep "main" etc.
    if len(func_name) <= 2 and func_name.lower() not in ["main"]:
        return False
    
    # Skip functions starting with single underscore (usually compiler-generated)
    # But keep _main, _WinMain, _start
    if func_name.startswith("_"):
        keep_names = ["_main", "_winmain", "_start", "_wmain"]
        if func_name.lower() not in keep_names:
            return False
    
    # Skip FUN_ functions that are very short (likely stubs/library code)
    body = func.getBody()
    if body:
        num_addrs = body.getNumAddresses()
        # For FUN_* functions, require minimum size (default 50 bytes, configurable)
        min_fun_size = int(os.environ.get("MIN_FUNCTION_SIZE", "50"))
        if func_name.startswith("FUN_") and num_addrs < min_fun_size:
            return False
        # For named functions, require at least 10 bytes
        elif num_addrs < 10:
            return False
    
    return True


def _is_stdlib_code(c_code: str) -> bool:
    """
    Check if decompiled code is a standard library function based on its content.
    This catches functions that slip through the name-based filter.
    """
    # Check for std:: namespace in the code (including comments)
    stdlib_patterns = [
        "std::",
        "__gnu_cxx::",
        "operator new",
        "operator delete",
        "__ptr_traits",
        "__alloc_traits",
        "pointer_to(",
        "addressof(",
        "::allocator",
        "basic_string<",
        "char_traits<",
    ]
    
    code_lower = c_code.lower()
    for pattern in stdlib_patterns:
        if pattern.lower() in code_lower:
            return True
    
    return False


def _is_trivial_function(c_code: str) -> bool:
    """
    Check if a function is trivial (just returns the parameter, empty, or single-line).
    These are usually compiler-generated stubs or wrappers.
    """
    import re
    
    # Remove comments and whitespace for analysis
    code_stripped = re.sub(r'/\*.*?\*/', '', c_code, flags=re.DOTALL)
    code_stripped = re.sub(r'//.*', '', code_stripped)
    code_stripped = code_stripped.strip()
    
    # Count actual statements (lines with semicolons, excluding function signature)
    lines = [l.strip() for l in code_stripped.split('\n') if l.strip()]
    
    # Remove function signature line(s)
    body_started = False
    body_lines = []
    brace_count = 0
    for line in lines:
        if '{' in line:
            body_started = True
            brace_count += line.count('{')
            brace_count -= line.count('}')
            # If there's content after the brace, include it
            after_brace = line.split('{', 1)[1].strip()
            if after_brace and after_brace != '}':
                body_lines.append(after_brace)
        elif body_started:
            brace_count += line.count('{')
            brace_count -= line.count('}')
            if brace_count > 0 or (brace_count == 0 and line != '}'):
                body_lines.append(line)
    
    # Filter out empty lines and closing braces
    meaningful_lines = [l for l in body_lines if l and l != '}' and l != '{']
    
    # If only one meaningful line and it's just "return param_X;", it's trivial
    if len(meaningful_lines) <= 1:
        if not meaningful_lines:
            return True
        line = meaningful_lines[0].lower()
        # Pattern: "return param_1;" or "return something;"
        if re.match(r'^return\s+\w+\s*;?$', line):
            return True
    
    return False


def decompile_binary(file_path: str, job_id: str) -> Dict[str, str]:
    """
    Decompile a binary file and return a mapping of function names to decompiled C code.
    Filters to only include user-written functions (not library code).
    
    Args:
        file_path: Path to the binary file to decompile
        job_id: Unique job identifier for project naming
        
    Returns:
        Dictionary mapping function names to their decompiled C code
    """
    if not GHIDRA_AVAILABLE:
        print("[*] Using mock decompiler (Ghidra not configured)")
        return _mock_decompile(file_path)
    
    ensure_project_dir()
    
    try:
        start_ghidra()
    except Exception as e:
        print(f"[!] Failed to start Ghidra: {e}")
        print("[*] Falling back to mock decompiler")
        return _mock_decompile(file_path)
    
    import pyghidra
    # Import Ghidra classes after starting JVM
    from ghidra.app.decompiler import DecompInterface
    
    functions = {}
    project_name = f"job_{job_id}"
    
    try:
        # Open/create a project for this job
        with pyghidra.open_project(PROJECT_DIR, project_name, create=True) as project:
            # Load the binary into the project
            loader = pyghidra.program_loader().project(project).source(file_path)
            with loader.load() as load_results:
                load_results.save(pyghidra.task_monitor())
            
            # Get the program path (the filename in the project root)
            program_path = "/" + os.path.basename(file_path)
            
            # Open the program and analyze it
            with pyghidra.program_context(project, program_path) as program:
                # Run auto-analysis with a 120-second timeout
                print(f"[*] Running Ghidra auto-analysis...")
                analysis_log = pyghidra.analyze(program, pyghidra.task_monitor(120))
                
                # Set up decompiler interface
                decompiler = DecompInterface()
                decompiler.openProgram(program)
                
                # Get all functions
                func_manager = program.getFunctionManager()
                func_iterator = func_manager.getFunctions(True)
                
                print(f"[*] Identifying user-written functions...")
                user_functions = []
                skipped_count = 0
                
                for func in func_iterator:
                    func_name = func.getName()
                    
                    if is_user_function(func, func_name):
                        user_functions.append((func, func_name))
                    else:
                        skipped_count += 1
                
                print(f"[+] Found {len(user_functions)} user functions (skipped {skipped_count} library functions)")
                
                # Decompile user functions
                print(f"[*] Decompiling user functions...")
                for func, func_name in user_functions:
                    # Decompile the function with a 30-second timeout per function
                    result = decompiler.decompileFunction(func, 30, pyghidra.task_monitor())
                    
                    if result.decompileCompleted():
                        decomp_func = result.getDecompiledFunction()
                        if decomp_func:
                            c_code = decomp_func.getC()
                            if c_code:
                                # Post-filter: Skip if decompiled code contains std:: (template instantiation)
                                if _is_stdlib_code(c_code):
                                    print(f"[-] Skipping stdlib function: {func_name}")
                                    skipped_count += 1
                                    continue
                                # Post-filter: Skip trivial functions (just return param)
                                if _is_trivial_function(c_code):
                                    print(f"[-] Skipping trivial function: {func_name}")
                                    skipped_count += 1
                                    continue
                                functions[func_name] = c_code
                                print(f"[+] Decompiled: {func_name}")
                
                decompiler.dispose()
                
    except Exception as e:
        print(f"[!] Error during decompilation: {e}")
        print("[*] Falling back to mock decompiler")
        return _mock_decompile(file_path)
    finally:
        # Clean up project directory
        project_path = os.path.join(PROJECT_DIR, project_name + ".gpr")
        project_folder = os.path.join(PROJECT_DIR, project_name + ".rep")
        if os.path.exists(project_path):
            os.remove(project_path)
        if os.path.exists(project_folder):
            shutil.rmtree(project_folder)
    
    return functions


def _mock_decompile(file_path: str) -> Dict[str, str]:
    """
    Mock decompilation for development/testing without Ghidra.
    Returns sample decompiled code that looks realistic.
    """
    filename = os.path.basename(file_path)
    
    # Return mock decompiled code (simulating user-written functions only)
    return {
        "main": f'''int main(int argc, char **argv)
{{
    int iVar1;
    undefined8 uVar2;
    char *pcVar3;
    long lVar4;
    
    // Binary: {filename}
    iVar1 = 0;
    if (argc < 2) {{
        pcVar3 = "Usage: %s <input>\\n";
        goto LAB_00401050;
    }}
    
    uVar2 = process_input(argv[1]);
    if ((int)uVar2 == 0) {{
        pcVar3 = "Error processing input\\n";
LAB_00401050:
        printf(pcVar3, *argv);
        iVar1 = 1;
    }}
    else {{
        lVar4 = calculate_result((long)uVar2);
        printf("Result: %ld\\n", lVar4);
    }}
    
    return iVar1;
}}''',
        "process_input": '''undefined8 process_input(char *param_1)
{{
    size_t sVar1;
    void *pvVar2;
    undefined8 uVar3;
    
    sVar1 = strlen(param_1);
    if (sVar1 == 0) {{
        uVar3 = 0;
    }}
    else {{
        pvVar2 = malloc(sVar1 + 1);
        if (pvVar2 == (void *)0x0) {{
            uVar3 = 0;
        }}
        else {{
            strcpy((char *)pvVar2, param_1);
            uVar3 = (undefined8)pvVar2;
        }}
    }}
    return uVar3;
}}''',
        "calculate_result": '''long calculate_result(long param_1)
{{
    long lVar1;
    int iVar2;
    long lVar3;
    
    lVar1 = 0;
    if (param_1 != 0) {{
        lVar3 = 0;
        do {{
            iVar2 = *(int *)(param_1 + lVar3 * 4);
            lVar1 = lVar1 + (long)iVar2;
            lVar3 = lVar3 + 1;
        }} while (lVar3 < 10);
    }}
    return lVar1;
}}''',
    }
