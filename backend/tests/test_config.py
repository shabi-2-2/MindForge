import re
from pathlib import Path

import pytest

from app.config import (
    DEFAULT_CORS_ORIGIN_REGEX,
    ENV_FILE,
    Settings,
)


def test_env_file_resolves_to_backend_env_regardless_of_cwd():
    assert ENV_FILE == Path(__file__).resolve().parents[1] / ".env"
    assert ENV_FILE.name == ".env"


def test_settings_reads_gemini_values_from_environment(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "unit-test-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-test-model")

    settings = Settings()

    assert settings.gemini_api_key == "unit-test-key"
    assert settings.gemini_model == "gemini-test-model"


def test_blank_gemini_key_is_treated_as_missing(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "   ")

    assert Settings().gemini_api_key is None


def test_default_cors_regex_covers_live_server_ports(monkeypatch):
    monkeypatch.delenv("CORS_ORIGIN_REGEX", raising=False)

    settings = Settings()
    assert settings.cors_origin_regex == DEFAULT_CORS_ORIGIN_REGEX

    pattern = re.compile(settings.cors_origin_regex)
    for origin in [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "http://localhost:5501",
        "http://127.0.0.1:5512",
        "http://[::1]:5500",
    ]:
        assert pattern.fullmatch(origin), origin

    for origin in [
        "https://evil.example",
        "http://localhost.evil.example:5500",
        "http://192.168.1.10:5500",
        "null",
    ]:
        assert not pattern.fullmatch(origin), origin


def test_cors_regex_can_be_disabled(monkeypatch):
    monkeypatch.setenv("CORS_ORIGIN_REGEX", "   ")

    assert Settings().cors_origin_regex is None


def test_cors_origins_are_trimmed_and_normalised(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS",
        " http://localhost:5500/ , http://127.0.0.1:5501 ,, ",
    )

    assert Settings().cors_origins == [
        "http://localhost:5500",
        "http://127.0.0.1:5501",
    ]
