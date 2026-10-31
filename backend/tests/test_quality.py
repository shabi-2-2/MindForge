import copy

import pytest

from app.schemas import GenerateResponse
from app.services.quality import QualityIssue, validate_response_quality


def response_from(mutate, valid_payload):
    payload = copy.deepcopy(valid_payload)
    mutate(payload)
    return GenerateResponse.model_validate(payload)


def test_valid_payload_passes_quality_checks(valid_payload):
    response = GenerateResponse.model_validate(valid_payload)

    validate_response_quality(response)


@pytest.mark.parametrize(
    ("mutate", "reason"),
    [
        (
            lambda payload: payload["summary"].update(text="Too short."),
            "summary_too_short",
        ),
        (
            lambda payload: payload["summary"].update(
                keyConcepts=["Light reactions", "Calvin cycle"]
            ),
            "too_few_key_concepts",
        ),
        (
            lambda payload: payload["summary"].update(
                keyConcepts=[f"Concept {index}" for index in range(11)]
            ),
            "too_many_key_concepts",
        ),
        (
            lambda payload: payload["summary"].update(
                keyConcepts=["Chlorophyll", "chlorophyll", "Calvin cycle"]
            ),
            "duplicate_key_concepts",
        ),
        (
            lambda payload: payload["quiz"][0].update(question="Why?"),
            "question_too_short",
        ),
        (
            lambda payload: payload["quiz"][0].update(explanation="Because."),
            "explanation_too_short",
        ),
        (
            lambda payload: payload["quiz"][0].update(
                options=["Same", "same", "Other", "Another"]
            ),
            "duplicate_options",
        ),
        (
            lambda payload: payload["quiz"][1].update(
                question=payload["quiz"][0]["question"]
            ),
            "duplicate_questions",
        ),
        (
            lambda payload: payload["quiz"][1].update(
                question="In photosynthesis, what is the main energy conversion?"
            ),
            "duplicate_questions",
        ),
        (
            lambda payload: payload.update(flashcards=payload["flashcards"][:2]),
            "too_few_flashcards",
        ),
        (
            lambda payload: payload.update(
                flashcards=payload["flashcards"] * 4
            ),
            "too_many_flashcards",
        ),
        (
            lambda payload: payload["flashcards"][1].update(
                front=payload["flashcards"][0]["front"]
            ),
            "duplicate_flashcards",
        ),
        (
            lambda payload: payload["flashcards"][1].update(
                front="What is photosynthesis"
            ),
            "duplicate_flashcards",
        ),
    ],
)
def test_quality_issues_are_detected(mutate, reason, valid_payload):
    response = response_from(mutate, valid_payload)

    with pytest.raises(QualityIssue) as info:
        validate_response_quality(response)

    assert info.value.reason == reason


def test_quality_allows_difficulty_specific_flashcard_counts(valid_payload):
    payload = copy.deepcopy(valid_payload)
    payload["flashcards"] = [
        {"front": "What is chlorophyll?", "back": "A light-absorbing pigment."},
        {"front": "Where does the Calvin cycle occur?", "back": "In the chloroplast stroma."},
        {"front": "What does ATP provide?", "back": "Energy for carbon fixation."},
        {"front": "Which gas is released?", "back": "Oxygen."},
        {"front": "What splits water?", "back": "The light-dependent reactions."},
        {"front": "What is a thylakoid?", "back": "A membrane-bound photosynthetic compartment."},
    ]

    validate_response_quality(GenerateResponse.model_validate(payload))
