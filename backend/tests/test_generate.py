import json

import pytest
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors

from app.main import app
from app.services.generation import get_generation_service


REQUEST = {
    "topic": "Photosynthesis",
    "notes": "Plants use sunlight to convert carbon dioxide and water into glucose.",
    "answerStyle": "exam",
    "difficulty": "medium",
}


@pytest.fixture
def api_client():
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()


def override_service(service):
    app.dependency_overrides[get_generation_service] = lambda: service


def test_generate_returns_valid_gemini_material(
    api_client, make_service, valid_payload
):
    service, _ = make_service([json.dumps(valid_payload)])
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 200
    data = response.json()

    assert set(data) == {"summary", "quiz", "flashcards"}
    assert data["summary"]["text"].strip()
    assert data["summary"]["keyConcepts"]
    assert len(data["quiz"]) == 5

    for question in data["quiz"]:
        assert set(question) == {
            "question",
            "options",
            "correctAnswer",
            "explanation",
        }
        assert len(question["options"]) == 4
        assert all(option.strip() for option in question["options"])
        assert isinstance(question["correctAnswer"], int)
        assert 0 <= question["correctAnswer"] <= 3
        assert question["explanation"].strip()

    assert data["flashcards"]
    for card in data["flashcards"]:
        assert set(card) == {"front", "back"}
        assert card["front"].strip()
        assert card["back"].strip()


def test_missing_api_key_returns_safe_configuration_error(
    api_client, make_service
):
    service, client = make_service(["unused"], api_key=None)
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 503
    detail = response.json()["detail"]
    assert detail["code"] == "configuration_error"
    assert "GEMINI_API_KEY" in detail["message"]
    assert client.calls == []


def test_missing_model_returns_safe_configuration_error(
    api_client, make_service
):
    service, _ = make_service(["unused"], model="")
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "configuration_error"


def test_authentication_errors_are_safe(api_client, make_service):
    provider_error = genai_errors.APIError(
        401,
        {
            "error": {
                "code": 401,
                "message": "API key SECRET-KEY-VALUE is invalid",
                "status": "UNAUTHENTICATED",
            }
        },
    )
    service, _ = make_service([provider_error])
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)
    body = response.text

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "provider_auth_error"
    assert "SECRET-KEY-VALUE" not in body
    assert "test-api-key" not in body
    assert "Plants use sunlight" not in body
    assert "Traceback" not in body


def test_rate_limit_returns_429(api_client, make_service):
    provider_error = genai_errors.APIError(
        429,
        {
            "error": {
                "code": 429,
                "message": "Quota exceeded",
                "status": "RESOURCE_EXHAUSTED",
            }
        },
    )
    service, _ = make_service([provider_error])
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "provider_rate_limited"


def test_invalid_provider_json_returns_safe_error(api_client, make_service):
    service, _ = make_service(["this is not JSON"])
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "invalid_provider_response"
    assert "this is not JSON" not in response.text


def test_malformed_provider_schema_returns_safe_error(
    api_client, make_service, valid_payload
):
    valid_payload["quiz"] = valid_payload["quiz"][:4]
    service, _ = make_service([json.dumps(valid_payload)])
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "invalid_provider_response"


def test_generate_still_rejects_invalid_input(api_client):
    response = api_client.post(
        "/api/generate",
        json={
            "topic": "",
            "notes": "Some notes",
            "answerStyle": "exam",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_generate_whitespace_only_topic(api_client):
    response = api_client.post(
        "/api/generate",
        json={
            "topic": "   ",
            "notes": "Some notes",
            "answerStyle": "exam",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_generate_missing_fields(api_client):
    response = api_client.post("/api/generate", json={"topic": "Test"})
    assert response.status_code == 422


def test_generate_invalid_answer_style(api_client):
    response = api_client.post(
        "/api/generate",
        json={
            "topic": "Test",
            "notes": "Some notes",
            "answerStyle": "invalid",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_generate_invalid_difficulty(api_client):
    response = api_client.post(
        "/api/generate",
        json={
            "topic": "Test",
            "notes": "Some notes",
            "answerStyle": "exam",
            "difficulty": "invalid",
        },
    )
    assert response.status_code == 422


def test_generate_topic_too_long(api_client):
    response = api_client.post(
        "/api/generate",
        json={
            "topic": "a" * 121,
            "notes": "Some notes",
            "answerStyle": "exam",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_generate_notes_too_long(api_client):
    response = api_client.post(
        "/api/generate",
        json={
            "topic": "Test",
            "notes": "a" * 20001,
            "answerStyle": "exam",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_cors_headers():
    with TestClient(app) as client:
        response = client.options(
            "/api/generate",
            headers={
                "Origin": "http://localhost:8000",
                "Access-Control-Request-Method": "POST",
            },
        )
    assert response.status_code in [200, 204]
