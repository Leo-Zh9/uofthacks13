from pydantic import BaseModel
from typing import Optional, Dict, List
from enum import Enum


class JobStatus(str, Enum):
    PENDING = "pending"
    UPLOADING = "uploading"
    DISASSEMBLING = "disassembling"
    ANALYZING = "analyzing"
    AI_REFACTORING = "ai_refactoring"
    COMPLETED = "completed"
    FAILED = "failed"


class JobResponse(BaseModel):
    job_id: str
    status: JobStatus
    message: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: JobStatus
    stage: str
    progress: int  # 0-100
    logs: List[str]
    error: Optional[str] = None


class FunctionCode(BaseModel):
    name: str
    raw_code: str
    refactored_code: Optional[str] = None


class JobResultResponse(BaseModel):
    job_id: str
    status: JobStatus
    functions: List[FunctionCode]
    raw_combined: str
    refactored_combined: str
    error: Optional[str] = None


class UploadResponse(BaseModel):
    job_id: str
    message: str
