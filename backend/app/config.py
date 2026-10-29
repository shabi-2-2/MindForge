import os
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv


# Load backend/.env once at import time. Real environment variables take
# precedence, so deployments can inject configuration without a file.
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=ENV_FILE, override=False)


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    try:
        value = int(raw)
    except ValueError:
        return default

    return max(minimum, min(maximum, value))


def _env_float(name: str, default: float, minimum: float, maximum: float) -> float:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default

    try:
        value = float(raw)
    except ValueError:
        return default

    return max(minimum, min(maximum, value))


class Settings:
    def __init__(self):
        self.app_name = os.getenv("APP_NAME", "MindForge API")
        self.app_version = os.getenv("APP_VERSION", "1.0.0")
        self.api_prefix = os.getenv("API_PREFIX", "/api")

        # CORS configuration - only local origins, no wildcard
        cors_origins_str = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:8000,http://127.0.0.1:8000,http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://127.0.0.1:3000",
        )
        self.cors_origins: List[str] = [
            origin.strip() for origin in cors_origins_str.split(",") if origin.strip()
        ]

        self.host = os.getenv("HOST", "127.0.0.1")
        self.port = int(os.getenv("PORT", "8000"))

        # Gemini configuration. Secrets stay on the server; these values are
        # never included in API responses or logs.
        self.gemini_api_key: Optional[str] = (
            os.getenv("GEMINI_API_KEY", "").strip() or None
        )
        self.gemini_model: str = os.getenv("GEMINI_MODEL", "").strip()
        self.gemini_timeout_seconds: float = _env_float(
            "GEMINI_TIMEOUT_SECONDS", 45.0, minimum=1.0, maximum=120.0
        )
        self.gemini_max_retries: int = _env_int(
            "GEMINI_MAX_RETRIES", 2, minimum=0, maximum=3
        )


settings = Settings()
