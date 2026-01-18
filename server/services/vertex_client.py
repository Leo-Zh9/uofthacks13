"""
Vertex AI Client for GGUF Model Inference

This module provides a client to call your deployed GGUF model on Vertex AI.
It can be used as a drop-in replacement for local LLM4Decompile inference.

Usage:
    from services.vertex_client import VertexDecompileClient
    
    client = VertexDecompileClient()
    refined_code = await client.decompile(ghidra_pseudo_c)
"""

import os
import json
import httpx
from typing import Optional
from google.auth import default
from google.auth.transport.requests import Request
import asyncio


class VertexDecompileClient:
    """
    Client for calling GGUF model deployed on Vertex AI.
    
    Handles Google Cloud authentication and request formatting.
    """
    
    def __init__(
        self,
        endpoint_id: Optional[str] = None,
        project_id: Optional[str] = None,
        region: Optional[str] = None,
    ):
        """
        Initialize the Vertex AI client.
        
        Args:
            endpoint_id: Vertex AI endpoint ID (or set VERTEX_ENDPOINT_ID env var)
            project_id: GCP project ID (or set GCP_PROJECT_ID env var)
            region: GCP region (or set GCP_REGION env var, defaults to us-central1)
        """
        self.endpoint_id = endpoint_id or os.environ.get("VERTEX_ENDPOINT_ID")
        self.project_id = project_id or os.environ.get("GCP_PROJECT_ID")
        self.region = region or os.environ.get("GCP_REGION", "us-central1")
        
        if not self.endpoint_id:
            raise ValueError("endpoint_id required (or set VERTEX_ENDPOINT_ID)")
        if not self.project_id:
            raise ValueError("project_id required (or set GCP_PROJECT_ID)")
        
        # Build the endpoint URL
        self.endpoint_url = (
            f"https://{self.region}-aiplatform.googleapis.com/v1/"
            f"projects/{self.project_id}/locations/{self.region}/"
            f"endpoints/{self.endpoint_id}:predict"
        )
        
        # For direct container access (if you deploy with public endpoint)
        self.direct_url = os.environ.get("VERTEX_DIRECT_URL")
        
        self._credentials = None
        self._http_client = None
    
    def _get_credentials(self):
        """Get Google Cloud credentials with token refresh."""
        if self._credentials is None:
            self._credentials, _ = default(
                scopes=["https://www.googleapis.com/auth/cloud-platform"]
            )
        
        # Refresh if expired
        if not self._credentials.valid:
            self._credentials.refresh(Request())
        
        return self._credentials
    
    def _get_auth_headers(self) -> dict:
        """Get authorization headers for Vertex AI."""
        creds = self._get_credentials()
        return {
            "Authorization": f"Bearer {creds.token}",
            "Content-Type": "application/json",
        }
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=120.0)  # 2 min timeout for large models
        return self._http_client
    
    async def decompile(
        self,
        ghidra_code: str,
        max_tokens: int = 2048,
        temperature: float = 0.0,
    ) -> str:
        """
        Refine Ghidra pseudo-C into clean C code using the Vertex AI model.
        
        Args:
            ghidra_code: Raw Ghidra pseudo-C code
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature (0 = greedy/deterministic)
            
        Returns:
            Refined C code
        """
        # Use direct URL if available (faster, no Vertex overhead)
        if self.direct_url:
            return await self._call_direct(ghidra_code, max_tokens, temperature)
        
        # Otherwise use Vertex AI prediction API
        return await self._call_vertex(ghidra_code, max_tokens, temperature)
    
    async def _call_vertex(
        self,
        ghidra_code: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Call via Vertex AI prediction API."""
        client = await self._get_client()
        
        payload = {
            "instances": [
                {
                    "ghidra_code": ghidra_code,
                    "max_tokens": max_tokens,
                }
            ],
            "parameters": {
                "temperature": temperature,
            }
        }
        
        response = await client.post(
            self.endpoint_url,
            headers=self._get_auth_headers(),
            json=payload,
        )
        
        if response.status_code != 200:
            raise Exception(f"Vertex AI error: {response.status_code} - {response.text}")
        
        result = response.json()
        predictions = result.get("predictions", [])
        
        if not predictions:
            raise Exception("No predictions returned from Vertex AI")
        
        return predictions[0].get("refined_code", "")
    
    async def _call_direct(
        self,
        ghidra_code: str,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Call the container directly (if exposed publicly or via Cloud Run)."""
        client = await self._get_client()
        
        payload = {
            "ghidra_code": ghidra_code,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        
        response = await client.post(
            f"{self.direct_url}/decompile",
            json=payload,
        )
        
        if response.status_code != 200:
            raise Exception(f"Direct endpoint error: {response.status_code} - {response.text}")
        
        result = response.json()
        return result.get("refined_code", "")
    
    async def health_check(self) -> bool:
        """Check if the endpoint is healthy."""
        try:
            if self.direct_url:
                client = await self._get_client()
                response = await client.get(f"{self.direct_url}/health")
                return response.status_code == 200
            else:
                # For Vertex AI, we'd need to make a test prediction
                # Just check credentials are valid
                self._get_credentials()
                return True
        except Exception:
            return False
    
    async def close(self):
        """Close the HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None


# Singleton instance for use in the app
_vertex_client: Optional[VertexDecompileClient] = None


def get_vertex_client() -> Optional[VertexDecompileClient]:
    """Get or create the Vertex AI client singleton."""
    global _vertex_client
    
    # Check if Vertex AI is configured
    if not os.environ.get("VERTEX_ENDPOINT_ID"):
        return None
    
    if _vertex_client is None:
        try:
            _vertex_client = VertexDecompileClient()
            print(f"[+] Vertex AI client initialized")
            print(f"    Endpoint: {_vertex_client.endpoint_id}")
            print(f"    Region: {_vertex_client.region}")
        except Exception as e:
            print(f"[!] Failed to initialize Vertex AI client: {e}")
            return None
    
    return _vertex_client


def is_vertex_available() -> bool:
    """Check if Vertex AI decompilation is available."""
    return get_vertex_client() is not None


async def decompile_with_vertex(ghidra_code: str) -> str:
    """
    Convenience function to decompile using Vertex AI.
    
    Falls back to returning original code if Vertex AI is not available.
    """
    client = get_vertex_client()
    if client is None:
        print("[!] Vertex AI not configured, returning original code")
        return ghidra_code
    
    try:
        return await client.decompile(ghidra_code)
    except Exception as e:
        print(f"[!] Vertex AI inference failed: {e}")
        return ghidra_code
