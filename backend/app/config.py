import os
from typing import List


class Settings:
    def __init__(self):
        self.app_name = os.getenv("APP_NAME", "MindForge API")
        self.app_version = os.getenv("APP_VERSION", "1.0.0")
        self.api_prefix = os.getenv("API_PREFIX", "/api")
        
        # CORS configuration - only local origins, no wildcard
        cors_origins_str = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000"
        )
        self.cors_origins: List[str] = [
            origin.strip() for origin in cors_origins_str.split(",") if origin.strip()
        ]
        
        self.host = os.getenv("HOST", "127.0.0.1")
        self.port = int(os.getenv("PORT", "8000"))


settings = Settings()
