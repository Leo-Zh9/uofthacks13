const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface UploadResponse {
  job_id: string;
  message: string;
}

export interface JobStatusResponse {
  job_id: string;
  status: 'pending' | 'uploading' | 'disassembling' | 'analyzing' | 'ai_refactoring' | 'completed' | 'failed';
  stage: string;
  progress: number;
  logs: string[];
  error: string | null;
}

export interface FunctionCode {
  name: string;
  raw_code: string;
  refactored_code: string | null;
}

export interface JobResultResponse {
  job_id: string;
  status: string;
  functions: FunctionCode[];
  raw_combined: string;
  refactored_combined: string;
  error: string | null;
}

export interface UploadOptions {
  geminiMode?: boolean;
}

export async function uploadBinary(file: File, options?: UploadOptions): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  // Build URL with query params
  const url = new URL(`${API_BASE_URL}/api/upload`);
  if (options?.geminiMode) {
    url.searchParams.append('gemini_mode', 'true');
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Upload failed');
  }

  return response.json();
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  const response = await fetch(`${API_BASE_URL}/api/job/${jobId}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get job status');
  }

  return response.json();
}

export async function getJobResult(jobId: string): Promise<JobResultResponse> {
  const response = await fetch(`${API_BASE_URL}/api/job/${jobId}/result`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Failed to get job result');
  }

  return response.json();
}

export interface CleanupResponse {
  original_code: string;
  cleaned_code: string;
  function_name: string | null;
}

export async function cleanupCodeWithGemini(code: string, functionName?: string): Promise<CleanupResponse> {
  const response = await fetch(`${API_BASE_URL}/api/cleanup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      code,
      function_name: functionName,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Cleanup failed');
  }

  return response.json();
}

export function downloadAsFile(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
