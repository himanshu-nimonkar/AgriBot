"""
Yolo Deep-Ag Copilot - Configuration Module
Loads environment variables and provides typed configuration.
"""

import os
from pathlib import Path
from functools import lru_cache
from pydantic_settings import BaseSettings
from dotenv import load_dotenv
from typing import Optional

# Load .env from project root
env_path = Path(__file__).parent.parent / ".env"
load_dotenv(env_path)


class Settings(BaseSettings):
    """Application settings with validation."""
    
    # Cloudflare
    cloudflare_account_id: str = ""
    cloudflare_api_token: str = ""
    cloudflare_vectorize_index: str = "agribot-knowledge"
    
    # Google Earth Engine
    gee_service_account_file: str = ""
    
    # Gemini API (for Veo3 video generation + Vision analysis)
    gemini_api_key: str = ""
    
    # Morph LLM (additive integration)
    morph_api_key: str = ""
    
    # Vapi.ai
    vapi_private_key: str = ""
    vapi_public_key: str = ""
    vapi_phone_number_id: str = ""
    vapi_phone_number: str = ""
    
    # Yolo County defaults
    yolo_county_lat: float = 38.7646
    yolo_county_lon: float = -121.9018
    
    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    
    # Cloudflare Workers AI endpoints
    @property
    def cf_ai_url(self) -> str:
        return f"https://api.cloudflare.com/client/v4/accounts/{self.cloudflare_account_id}/ai/run"
    
    @property
    def cf_vectorize_url(self) -> str:
        return f"https://api.cloudflare.com/client/v4/accounts/{self.cloudflare_account_id}/vectorize/v2/indexes/{self.cloudflare_vectorize_index}"
    
    # Frontend
    vite_api_url: Optional[str] = None

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


# Convenience exports
settings = get_settings()
