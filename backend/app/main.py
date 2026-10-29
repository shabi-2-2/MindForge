import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from .config import settings
from .schemas import GenerateRequest, GenerateResponse
from .services.generation import (
    GeminiGenerationService,
    GeminiServiceError,
    get_generation_service,
    generation_service,
)


logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.gemini_api_key:
        logger.error(
            "GEMINI_API_KEY is not configured. /api/generate will return a "
            "configuration error until backend/.env is set."
        )
    if not settings.gemini_model:
        logger.error(
            "GEMINI_MODEL is not configured. /api/generate will return a "
            "configuration error until backend/.env is set."
        )

    yield

    await generation_service.aclose()


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="MindForge API - Study material generation backend",
    lifespan=lifespan,
)


# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        errors.append({
            "field": field,
            "message": error["msg"],
            "type": error["type"],
        })
    return JSONResponse(
        status_code=422,
        content={"detail": "Validation error", "errors": errors},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    headers = None
    if isinstance(exc.detail, dict) and exc.detail.get("retryAfter"):
        headers = {"Retry-After": str(exc.detail["retryAfter"])}

    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled server error (%s)", type(exc).__name__)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get(f"{settings.api_prefix}/health")
async def health_check():
    return {"status": "ok", "service": "MindForge API"}


@app.post(f"{settings.api_prefix}/generate", response_model=GenerateResponse)
async def generate_study_material(
    request: GenerateRequest,
    service: GeminiGenerationService = Depends(get_generation_service),
):
    try:
        return await service.generate(request)
    except GeminiServiceError as exc:
        detail = {
            "code": exc.code,
            "message": exc.message,
        }
        if exc.retry_after is not None:
            detail["retryAfter"] = exc.retry_after
        raise HTTPException(status_code=exc.status_code, detail=detail) from None
    except Exception:
        logger.error("Study generation failed unexpectedly")
        raise HTTPException(
            status_code=500,
            detail={
                "code": "generation_failed",
                "message": "Study generation failed. Please try again.",
            },
        ) from None
