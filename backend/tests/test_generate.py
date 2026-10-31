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


def test_repair_attempt_returns_valid_material(
    api_client, make_service, valid_payload
):
    service, client = make_service(
        ["not JSON", json.dumps(valid_payload)]
    )
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 200
    assert len(response.json()["quiz"]) == 5
    assert len(client.calls) == 2


def test_invalid_output_is_never_replaced_with_mock_material(
    api_client, make_service, valid_payload
):
    service, _ = make_service(["not JSON", "still not JSON"])
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "invalid_provider_response"
    assert "summary" not in response.text
    assert "keyConcepts" not in response.text
    assert valid_payload["summary"]["text"] not in response.text


def test_semantic_quality_failure_returns_safe_502(
    api_client, make_service, valid_payload
):
    valid_payload["quiz"][1]["question"] = valid_payload["quiz"][0]["question"]
    service, client = make_service([json.dumps(valid_payload)])
    override_service(service)

    response = api_client.post("/api/generate", json=REQUEST)

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "invalid_provider_response"
    assert "Photosynthesis converts" not in response.text
    assert len(client.calls) == 2


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


def preflight(client, origin, method="POST", headers="content-type"):
    return client.options(
        "/api/generate",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": headers,
        },
    )


@pytest.mark.parametrize(
    "origin",
    [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        # Live Server increments the port when 5500 is already in use.
        "http://localhost:5501",
        "http://127.0.0.1:5501",
        "http://localhost:5512",
        "http://127.0.0.1:5512",
        "http://localhost:8000",
    ],
)
def test_cors_preflight_allows_local_frontend_origins(api_client, origin):
    response = preflight(api_client, origin)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"].lower()


def test_cors_preflight_rejects_untrusted_origin(api_client):
    response = preflight(api_client, "https://evil.example")

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_cors_actual_post_includes_allow_origin(api_client, make_service, valid_payload):
    service, _ = make_service([json.dumps(valid_payload)])
    override_service(service)

    response = api_client.post(
        "/api/generate",
        json=REQUEST,
        headers={"Origin": "http://127.0.0.1:5501"},
    )

    assert response.status_code == 200
    assert (
        response.headers["access-control-allow-origin"]
        == "http://127.0.0.1:5501"
    )


def test_health_stays_at_api_prefix(api_client):
    assert api_client.get("/api/health").status_code == 200
    # Only /api/health is defined; a bare /health 404 is expected.
    assert api_client.get("/health").status_code == 404
