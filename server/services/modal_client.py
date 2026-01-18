"""
Modal Client for LLM4Decompile Cloud Inference

This module provides a client to call LLM4Decompile deployed on Modal.com.
When gemini_mode is OFF, requests are sent to the Modal endpoint for
GPU-accelerated inference instead of running locally.

Usage:
    from services.modal_client import decompile_with_modal, is_modal_available
    
    if is_modal_available():
        refined_code = await decompile_with_modal(ghidra_pseudo_c)
"""

import os
import httpx
from typing import Optional

# Modal endpoint URL - deployed LLM4Decompile model
MODAL_ENDPOINT_URL = os.environ.get(
    "MODAL_ENDPOINT_URL",
    "https://lukas-li-album--llm4decompile-llm4decompile-decompile.modal.run"
)
MODAL_HEALTH_URL = os.environ.get(
    "MODAL_HEALTH_URL", 
    "https://lukas-li-album--llm4decompile-llm4decompile-health.modal.run"
)


class ModalDecompileClient:
    """
    Client for calling LLM4Decompile deployed on Modal.com.
    
    No authentication required - Modal handles auth via the endpoint URL.
    """
    
    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        health_url: Optional[str] = None,
        timeout: float = 120.0,
    ):
        """
        Initialize the Modal client.
        
        Args:
            endpoint_url: Modal endpoint URL for decompile requests
            health_url: Modal health check URL
            timeout: Request timeout in seconds (default 120s for cold starts)
        """
        self.endpoint_url = endpoint_url or MODAL_ENDPOINT_URL
        self.health_url = health_url or MODAL_HEALTH_URL
        self.timeout = timeout
        self._http_client: Optional[httpx.AsyncClient] = None
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(timeout=self.timeout)
        return self._http_client
    
    async def decompile(
        self,
        ghidra_code: str,
        max_tokens: int = 2048,
    ) -> str:
        """
        Refine Ghidra pseudo-C into clean C code using the Modal-deployed model.
        
        Args:
            ghidra_code: Raw Ghidra pseudo-C code
            max_tokens: Maximum tokens to generate (optional, for future use)
            
        Returns:
            Refined C code
        """
        client = await self._get_client()
        
        payload = {
            "ghidra_code": ghidra_code,
            "max_tokens": max_tokens,
        }
        
        try:
            response = await client.post(
                self.endpoint_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            
            if response.status_code != 200:
                error_text = response.text[:500] if response.text else "Unknown error"
                raise Exception(f"Modal endpoint error: {response.status_code} - {error_text}")
            
            result = response.json()
            return result.get("refined_code", ghidra_code)
            
        except httpx.TimeoutException:
            raise Exception("Modal endpoint timed out (cold start may take up to 60s)")
        except httpx.ConnectError as e:
            raise Exception(f"Failed to connect to Modal endpoint: {e}")
    
    async def health_check(self) -> bool:
        """Check if the Modal endpoint is healthy."""
        try:
            client = await self._get_client()
            response = await client.get(self.health_url, timeout=30.0)
            if response.status_code == 200:
                data = response.json()
                return data.get("status") == "healthy"
            return False
        except Exception as e:
            print(f"[!] Modal health check failed: {e}")
            return False
    
    async def close(self):
        """Close the HTTP client."""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None


# Singleton instance for use in the app
_modal_client: Optional[ModalDecompileClient] = None


def get_modal_client() -> ModalDecompileClient:
    """Get or create the Modal client singleton."""
    global _modal_client
    
    if _modal_client is None:
        _modal_client = ModalDecompileClient()
        print(f"[+] Modal client initialized")
        print(f"    Endpoint: {_modal_client.endpoint_url}")
    
    return _modal_client


def is_modal_available() -> bool:
    """
    Check if Modal decompilation is available.
    
    Returns True if the endpoint URL is configured.
    Actual availability is checked via health_check().
    """
    return bool(MODAL_ENDPOINT_URL)


async def decompile_with_modal(ghidra_code: str, max_tokens: int = 2048) -> str:
    """
    Convenience function to decompile using Modal.
    
    Falls back to returning original code if Modal inference fails.
    
    Args:
        ghidra_code: Raw Ghidra pseudo-C code
        max_tokens: Maximum tokens to generate
        
    Returns:
        Refined C code, or original code if inference fails
    """
    client = get_modal_client()
    
    try:
        return await client.decompile(ghidra_code, max_tokens)
    except Exception as e:
        print(f"[!] Modal inference failed: {e}")
        # Return original code on failure instead of crashing
        return ghidra_code


async def check_modal_health() -> dict:
    """
    Check Modal endpoint health and return status info.
    
    Returns:
        Dict with status info: {"available": bool, "endpoint": str, "error": str|None}
    """
    client = get_modal_client()
    
    try:
        healthy = await client.health_check()
        return {
            "available": healthy,
            "endpoint": client.endpoint_url,
            "error": None if healthy else "Health check returned unhealthy status"
        }
    except Exception as e:
        return {
            "available": False,
            "endpoint": client.endpoint_url,
            "error": str(e)
        }
