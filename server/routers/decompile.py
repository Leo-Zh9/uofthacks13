import os
import sys
import uuid
import tempfile
import shutil
from typing import Dict, List, Any
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks

# Add server directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.schemas import (
    JobStatus,
    JobResponse,
    JobStatusResponse,
    JobResultResponse,
    FunctionCode,
    UploadResponse,
)

router = APIRouter(prefix="/api", tags=["decompile"])

# In-memory job store
jobs: Dict[str, Dict[str, Any]] = {}

# Constants
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
TEMP_DIR = tempfile.mkdtemp(prefix="decompiler_")

# PE magic bytes: MZ
PE_MAGIC = b"MZ"
# ELF magic bytes
ELF_MAGIC = b"\x7fELF"


@router.get("/health")
async def api_health_check():
    """Health check endpoint for the API."""
    return {"status": "healthy", "api": "decompiler"}


def validate_binary(content: bytes) -> bool:
    """Validate that the file is a PE or ELF binary."""
    if content[:2] == PE_MAGIC:
        return True
    if content[:4] == ELF_MAGIC:
        return True
    return False


def add_log(job_id: str, message: str):
    """Add a log message to a job."""
    if job_id in jobs:
        jobs[job_id]["logs"].append(message)


def update_job_status(job_id: str, status: JobStatus, stage: str, progress: int):
    """Update job status."""
    if job_id in jobs:
        jobs[job_id]["status"] = status
        jobs[job_id]["stage"] = stage
        jobs[job_id]["progress"] = progress


async def process_binary(job_id: str, file_path: str, gemini_mode: bool = False, vertex_mode: bool = False):
    """Background task to process the binary file."""
    from services.ghidra_service import decompile_binary
    from services.ai_service import refactor_code
    
    try:
        # Stage 1: Disassembling
        update_job_status(job_id, JobStatus.DISASSEMBLING, "Disassembling binary...", 10)
        add_log(job_id, "[*] Starting Ghidra analysis...")
        add_log(job_id, f"[*] Loading binary: {os.path.basename(file_path)}")
        
        # Log mode being used
        if gemini_mode:
            add_log(job_id, "[*] Using Gemini Mode (Gemini Pro + Flash)")
        elif vertex_mode:
            add_log(job_id, "[*] Using Vertex AI (Cloud GPU) for refactoring")
        else:
            add_log(job_id, "[*] Using LLM4Decompile + Gemini Flash for refactoring")
        
        # Decompile the binary
        add_log(job_id, "[*] Initializing decompiler interface...")
        functions = decompile_binary(file_path, job_id)
        
        add_log(job_id, f"[+] Found {len(functions)} functions")
        for func_name in list(functions.keys())[:10]:  # Log first 10 functions
            add_log(job_id, f"    - {func_name}")
        if len(functions) > 10:
            add_log(job_id, f"    ... and {len(functions) - 10} more")
        
        # Stage 2: Analyzing
        update_job_status(job_id, JobStatus.ANALYZING, "Analyzing control flow...", 40)
        add_log(job_id, "[*] Analyzing control flow graphs...")
        add_log(job_id, "[*] Identifying function boundaries...")
        
        # Store raw decompiled code
        jobs[job_id]["raw_functions"] = functions
        raw_combined = "\n\n".join([
            f"// Function: {name}\n{code}" 
            for name, code in functions.items()
        ])
        jobs[job_id]["raw_combined"] = raw_combined
        
        # Stage 3: AI Refactoring with LLM4Decompile, Vertex AI, or Gemini
        if gemini_mode:
            stage_name = "Gemini refactoring code..."
        elif vertex_mode:
            stage_name = "Vertex AI (Cloud GPU) refactoring code..."
        else:
            stage_name = "AI refactoring code..."
        update_job_status(job_id, JobStatus.AI_REFACTORING, stage_name, 60)
        if gemini_mode:
            add_log(job_id, "[*] Starting Gemini Pro refactoring...")
        elif vertex_mode:
            add_log(job_id, "[*] Starting Vertex AI inference...")
        else:
            add_log(job_id, "[*] Starting LLM4Decompile refinement...")
        
        # Limit functions to process (CPU inference is slow)
        # Prioritize: entry, main, and first few functions
        MAX_FUNCTIONS = int(os.environ.get("MAX_FUNCTIONS", "10"))
        priority_names = ["entry", "main", "_main", "WinMain", "_start"]
        
        # Sort functions: priority first, then others
        sorted_funcs = []
        other_funcs = []
        for name, code in functions.items():
            if any(p in name.lower() for p in ["entry", "main", "start"]):
                sorted_funcs.append((name, code))
            else:
                other_funcs.append((name, code))
        sorted_funcs.extend(other_funcs)
        
        # Limit to MAX_FUNCTIONS
        funcs_to_process = sorted_funcs[:MAX_FUNCTIONS]
        skipped = len(functions) - len(funcs_to_process)
        if skipped > 0:
            add_log(job_id, f"[*] Processing {len(funcs_to_process)} functions (skipping {skipped} for speed)")
        
        refactored_functions = {}
        total_functions = len(funcs_to_process)
        for i, (func_name, func_code) in enumerate(funcs_to_process):
            add_log(job_id, f"[*] Processing function: {func_name}")
            progress = 60 + int((i / total_functions) * 35)
            update_job_status(job_id, JobStatus.AI_REFACTORING, f"Refactoring {func_name}...", progress)
            
            refactored = await refactor_code(func_name, func_code, gemini_mode=gemini_mode, vertex_mode=vertex_mode)
            refactored_functions[func_name] = refactored
            add_log(job_id, f"[+] Completed: {func_name}")
        
        # Store refactored code
        jobs[job_id]["refactored_functions"] = refactored_functions
        refactored_combined = "\n\n".join([
            f"// Function: {name}\n{code}" 
            for name, code in refactored_functions.items()
        ])
        jobs[job_id]["refactored_combined"] = refactored_combined
        
        # Stage 4: Complete
        update_job_status(job_id, JobStatus.COMPLETED, "Completed!", 100)
        add_log(job_id, "[+] Decompilation and refactoring complete!")
        add_log(job_id, f"[+] Processed {len(functions)} functions successfully")
        
    except Exception as e:
        jobs[job_id]["status"] = JobStatus.FAILED
        jobs[job_id]["error"] = str(e)
        add_log(job_id, f"[!] Error: {str(e)}")
    finally:
        # Cleanup temp file
        if os.path.exists(file_path):
            os.remove(file_path)


@router.post("/upload", response_model=UploadResponse)
async def upload_binary(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    gemini_mode: bool = False,
    vertex_mode: bool = False,
):
    """Upload a binary file for decompilation.
    
    Args:
        file: The binary file to decompile
        gemini_mode: If True, use Gemini for refactoring instead of LLM4Decompile
        vertex_mode: If True, use Vertex AI (Cloud GPU) for faster inference
    """
    # Read file content
    content = await file.read()
    
    # Validate file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size is {MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    # Validate file type
    if not validate_binary(content):
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Only PE (.exe) and ELF binaries are supported."
        )
    
    # Generate job ID
    job_id = str(uuid.uuid4())
    
    # Save file to temp directory
    file_path = os.path.join(TEMP_DIR, f"{job_id}_{file.filename}")
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Determine mode string for logging
    if gemini_mode:
        mode_str = "Gemini"
    elif vertex_mode:
        mode_str = "Vertex AI (Cloud GPU)"
    else:
        mode_str = "LLM4Decompile + Gemini"
    
    # Initialize job
    jobs[job_id] = {
        "status": JobStatus.PENDING,
        "stage": "Queued",
        "progress": 0,
        "logs": [f"[*] File received: {file.filename}", f"[*] Size: {len(content)} bytes", f"[*] Mode: {mode_str}"],
        "file_path": file_path,
        "raw_functions": {},
        "refactored_functions": {},
        "raw_combined": "",
        "refactored_combined": "",
        "error": None,
        "gemini_mode": gemini_mode,
        "vertex_mode": vertex_mode,
    }
    
    # Start background processing
    background_tasks.add_task(process_binary, job_id, file_path, gemini_mode, vertex_mode)
    
    return UploadResponse(
        job_id=job_id,
        message="File uploaded successfully. Processing started."
    )


@router.get("/job/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str):
    """Get the status of a decompilation job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    return JobStatusResponse(
        job_id=job_id,
        status=job["status"],
        stage=job["stage"],
        progress=job["progress"],
        logs=job["logs"],
        error=job["error"],
    )


@router.get("/job/{job_id}/result", response_model=JobResultResponse)
async def get_job_result(job_id: str):
    """Get the result of a completed decompilation job."""
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    
    if job["status"] not in [JobStatus.COMPLETED, JobStatus.FAILED]:
        raise HTTPException(
            status_code=400,
            detail="Job is still processing. Please wait for completion."
        )
    
    functions = []
    raw_funcs = job.get("raw_functions", {})
    refactored_funcs = job.get("refactored_functions", {})
    
    for name, raw_code in raw_funcs.items():
        functions.append(FunctionCode(
            name=name,
            raw_code=raw_code,
            refactored_code=refactored_funcs.get(name),
        ))
    
    return JobResultResponse(
        job_id=job_id,
        status=job["status"],
        functions=functions,
        raw_combined=job.get("raw_combined", ""),
        refactored_combined=job.get("refactored_combined", ""),
        error=job["error"],
    )


@router.post("/warmup")
async def warmup_model():
    """
    Pre-load the LLM4Decompile model to avoid cold start delays.
    
    Call this endpoint before your demo to ensure the first upload
    doesn't have a 1-2 minute model loading delay.
    """
    from services.llm_service import get_model, is_available
    
    if not is_available():
        return {
            "status": "unavailable",
            "message": "LLM4Decompile dependencies not installed. Install with: pip install torch transformers accelerate bitsandbytes"
        }
    
    try:
        model, tokenizer = get_model()
        if model is not None:
            return {
                "status": "ready",
                "message": "LLM4Decompile model loaded and ready"
            }
        else:
            return {
                "status": "failed",
                "message": "Failed to load LLM4Decompile model"
            }
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error loading model: {str(e)}"
        }


@router.get("/model-status")
async def get_model_status():
    """Check the status of the LLM4Decompile model."""
    from services.llm_service import is_available, _model
    from services.gemini_service import is_available as gemini_available
    
    return {
        "llm4decompile_available": is_available(),
        "model_loaded": _model is not None,
        "gemini_available": gemini_available(),
        "openai_configured": bool(os.environ.get("OPENAI_API_KEY")),
    }


@router.post("/cleanup")
async def cleanup_code(request: dict):
    """
    Clean up decompiled code using Gemini to make it more human-readable.
    
    This endpoint removes unused variables, simplifies variable names,
    and cleans up redundant code patterns.
    """
    from services.gemini_service import cleanup_decompiled_code_async, is_available
    
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="Gemini API not configured. Set GEMINI_API_KEY environment variable."
        )
    
    code = request.get("code", "")
    function_name = request.get("function_name")
    
    if not code:
        raise HTTPException(status_code=400, detail="No code provided")
    
    try:
        cleaned_code = await cleanup_decompiled_code_async(code, function_name)
        return {
            "original_code": code,
            "cleaned_code": cleaned_code,
            "function_name": function_name
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")


@router.post("/analyze-malware")
async def analyze_malware(request: dict):
    """
    Analyze decompiled code for malware indicators using Gemini Flash.
    
    This endpoint examines the combined decompiled code and looks for
    malicious patterns like keyloggers, backdoors, ransomware, etc.
    """
    from services.gemini_service import analyze_for_malware_async, is_available
    
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="Gemini API not configured. Set GEMINI_API_KEY environment variable."
        )
    
    code = request.get("code", "")
    
    if not code:
        raise HTTPException(status_code=400, detail="No code provided")
    
    try:
        result = await analyze_for_malware_async(code)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Malware analysis failed: {str(e)}")


@router.get("/job/{job_id}/malware-analysis")
async def get_job_malware_analysis(job_id: str):
    """
    Analyze a completed job's code for malware indicators.
    
    This runs Gemini Flash analysis on the combined refactored code
    from a completed job.
    """
    from services.gemini_service import analyze_for_malware_async, is_available
    
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    
    if job["status"] != JobStatus.COMPLETED:
        raise HTTPException(
            status_code=400,
            detail="Job must be completed before malware analysis"
        )
    
    if not is_available():
        raise HTTPException(
            status_code=503,
            detail="Gemini API not configured. Set GEMINI_API_KEY environment variable."
        )
    
    # Get the combined refactored code
    combined_code = job.get("refactored_combined", "")
    if not combined_code:
        combined_code = job.get("raw_combined", "")
    
    if not combined_code:
        raise HTTPException(status_code=400, detail="No code available for analysis")
    
    try:
        result = await analyze_for_malware_async(combined_code)
        return {
            "job_id": job_id,
            "analysis": result
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Malware analysis failed: {str(e)}")
