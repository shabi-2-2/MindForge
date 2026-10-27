from fastapi.testclient import TestClient
from app.main import app


client = TestClient(app)


def test_generate_valid_request():
    response = client.post(
        "/api/generate",
        json={
            "topic": "Photosynthesis",
            "notes": "Plants use sunlight to convert carbon dioxide and water into glucose.",
            "answerStyle": "exam",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 200
    data = response.json()
    
    # Check structure
    assert "summary" in data
    assert "quiz" in data
    assert "flashcards" in data
    
    # Check summary
    assert "text" in data["summary"]
    assert "keyConcepts" in data["summary"]
    assert isinstance(data["summary"]["text"], str)
    assert len(data["summary"]["text"]) > 0
    assert isinstance(data["summary"]["keyConcepts"], list)
    assert len(data["summary"]["keyConcepts"]) > 0
    
    # Check quiz - exactly 5 questions
    assert len(data["quiz"]) == 5
    for question in data["quiz"]:
        assert "question" in question
        assert "options" in question
        assert "correctAnswer" in question
        assert "explanation" in question
        assert isinstance(question["options"], list)
        assert len(question["options"]) == 4
        assert isinstance(question["correctAnswer"], int)
        assert 0 <= question["correctAnswer"] <= 3
        assert isinstance(question["explanation"], str)
        assert len(question["explanation"]) > 0
    
    # Check flashcards
    assert isinstance(data["flashcards"], list)
    assert len(data["flashcards"]) >= 1
    for card in data["flashcards"]:
        assert "front" in card
        assert "back" in card
        assert isinstance(card["front"], str)
        assert len(card["front"]) > 0
        assert isinstance(card["back"], str)
        assert len(card["back"]) > 0


def test_generate_empty_topic():
    response = client.post(
        "/api/generate",
        json={
            "topic": "",
            "notes": "Some notes",
            "answerStyle": "exam",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_generate_whitespace_only_topic():
    response = client.post(
        "/api/generate",
        json={
            "topic": "   ",
            "notes": "Some notes",
            "answerStyle": "exam",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_generate_missing_fields():
    response = client.post(
        "/api/generate",
        json={
            "topic": "Test",
        },
    )
    assert response.status_code == 422


def test_generate_invalid_answer_style():
    response = client.post(
        "/api/generate",
        json={
            "topic": "Test",
            "notes": "Some notes",
            "answerStyle": "invalid",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_generate_invalid_difficulty():
    response = client.post(
        "/api/generate",
        json={
            "topic": "Test",
            "notes": "Some notes",
            "answerStyle": "exam",
            "difficulty": "invalid",
        },
    )
    assert response.status_code == 422


def test_generate_topic_too_long():
    response = client.post(
        "/api/generate",
        json={
            "topic": "a" * 121,
            "notes": "Some notes",
            "answerStyle": "exam",
            "difficulty": "medium",
        },
    )
    assert response.status_code == 422


def test_generate_notes_too_long():
    response = client.post(
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
    response = client.options(
        "/api/generate",
        headers={
            "Origin": "http://localhost:8000",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert response.status_code in [200, 204]
