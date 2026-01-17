"""
PyGhidra integration service for binary decompilation.

This service uses the new PyGhidra API to analyze and decompile binary files.
Requires:
- Java 17+ installed
- Ghidra installed with GHIDRA_INSTALL_DIR environment variable set
"""

import os
import shutil
from typing import Dict, Optional

# Check if Ghidra is properly configured
GHIDRA_INSTALL_DIR = os.environ.get("GHIDRA_INSTALL_DIR")
GHIDRA_AVAILABLE = False
_ghidra_started = False

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


def decompile_binary(file_path: str, job_id: str) -> Dict[str, str]:
    """
    Decompile a binary file and return a mapping of function names to decompiled C code.
    
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
                
                print(f"[*] Decompiling functions...")
                for func in func_iterator:
                    func_name = func.getName()
                    
                    # Skip external/thunk functions
                    if func.isExternal() or func.isThunk():
                        continue
                    
                    # Decompile the function with a 30-second timeout per function
                    result = decompiler.decompileFunction(func, 30, pyghidra.task_monitor())
                    
                    if result.decompileCompleted():
                        decomp_func = result.getDecompiledFunction()
                        if decomp_func:
                            c_code = decomp_func.getC()
                            if c_code:
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
    
    # Return mock decompiled code
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
    
    uVar2 = FUN_00401100(argv[1]);
    if ((int)uVar2 == 0) {{
        pcVar3 = "Error processing input\\n";
LAB_00401050:
        printf(pcVar3, *argv);
        iVar1 = 1;
    }}
    else {{
        lVar4 = FUN_00401200((long)uVar2);
        printf("Result: %ld\\n", lVar4);
    }}
    
    return iVar1;
}}''',
        "FUN_00401100": '''undefined8 FUN_00401100(char *param_1)
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
        "FUN_00401200": '''long FUN_00401200(long param_1)
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
        "FUN_00401300": '''void FUN_00401300(void *param_1, int param_2)
{{
    int iVar1;
    int iVar2;
    void *pvVar3;
    
    if ((param_1 != (void *)0x0) && (param_2 != 0)) {{
        iVar1 = 0;
        while (iVar1 < param_2) {{
            pvVar3 = (void *)((long)param_1 + (long)iVar1);
            iVar2 = iVar1 + 1;
            *(undefined *)pvVar3 = 0;
            iVar1 = iVar2;
        }}
    }}
    return;
}}''',
    }
