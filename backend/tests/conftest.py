"""Shared test doubles for the Gemini-backed generation service."""

import json
from types import SimpleNamespace

import pytest

from app.services.generation import GeminiGenerationService


def sample_payload():
    questions = [
        {
            "question": "What is the main energy conversion in photosynthesis?",
            "options": [
                "Light energy to chemical energy",
                "Chemical energy to light energy",
                "Heat energy to mechanical energy",
                "Chemical energy to mechanical energy",
            ],
            "correctAnswer": 0,
            "explanation": (
                "Photosynthesis stores light energy as chemical energy in glucose."
            ),
        },
        {
            "question": "Which gas do plants take in during photosynthesis?",
            "options": ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
            "correctAnswer": 1,
            "explanation": (
                "Plants use carbon dioxide as the carbon source for glucose."
            ),
        },
        {
            "question": "Where in the plant cell does photosynthesis mainly occur?",
            "options": ["Mitochondria", "Nucleus", "Chloroplasts", "Ribosomes"],
            "correctAnswer": 2,
            "explanation": (
                "Chloroplasts contain chlorophyll and the photosynthetic machinery."
            ),
        },
        {
            "question": "What role does chlorophyll play in photosynthesis?",
            "options": [
                "It absorbs light energy",
                "It stores water",
                "It copies DNA",
                "It breaks down glucose",
            ],
            "correctAnswer": 0,
            "explanation": (
                "Chlorophyll absorbs the light used by the light-dependent reactions."
            ),
        },
        {
            "question": "What do the light-dependent reactions produce?",
            "options": [
                "Glucose and oxygen",
                "ATP and NADPH",
                "Carbon dioxide and water",
                "Proteins and lipids",
            ],
            "correctAnswer": 1,
            "explanation": (
                "The light reactions produce ATP and NADPH for the Calvin cycle."
            ),
        },
    ]

    return {
        "summary": {
            "text": (
                "Photosynthesis converts light energy into chemical energy. "
                "Plants use carbon dioxide and water to produce glucose and oxygen."
            ),
            "keyConcepts": ["Light reactions", "Calvin cycle", "Chlorophyll"],
        },
        "quiz": questions,
        "flashcards": [
            {
                "front": "What is photosynthesis?",
                "back": (
                    "The conversion of light energy into chemical energy stored "
                    "in glucose."
                ),
            },
            {
                "front": "Where does photosynthesis occur?",
                "back": "Mainly in the chloroplasts of plant cells.",
            },
            {
                "front": "What does chlorophyll do?",
                "back": "It absorbs light energy for the light-dependent reactions.",
            },
            {
                "front": "What does the Calvin cycle produce?",
                "back": "It fixes carbon dioxide into glucose using ATP and NADPH.",
            },
        ],
    }


class FakeInteractions:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []
        self.index = 0

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        outcome = self.outcomes[min(self.index, len(self.outcomes) - 1)]
        self.index += 1

        if isinstance(outcome, BaseException):
            raise outcome
        if isinstance(outcome, dict):
            return SimpleNamespace(output_text=json.dumps(outcome))
        return SimpleNamespace(output_text=outcome)


class FakeAio:
    def __init__(self, outcomes):
        self.interactions = FakeInteractions(outcomes)

    async def aclose(self):
        return None


class FakeClient:
    def __init__(self, outcomes):
        self.aio = FakeAio(outcomes)

    @property
    def calls(self):
        return self.aio.interactions.calls


@pytest.fixture
def valid_payload():
    return sample_payload()


@pytest.fixture
def make_service():
    def _make(
        outcomes,
        api_key="test-api-key",
        model="gemini-test-model",
        timeout_seconds=5.0,
        max_retries=0,
    ):
        client = FakeClient(outcomes)
        service = GeminiGenerationService(
            client=client,
            settings_obj=SimpleNamespace(
                gemini_api_key=api_key,
                gemini_model=model,
                gemini_timeout_seconds=timeout_seconds,
                gemini_max_retries=max_retries,
            ),
        )
        return service, client

    return _make
