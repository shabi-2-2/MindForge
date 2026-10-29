"""Shared test doubles for the Gemini-backed generation service."""

import json
from types import SimpleNamespace

import pytest

from app.services.generation import GeminiGenerationService


def sample_payload():
    return {
        "summary": {
            "text": (
                "Photosynthesis converts light energy into chemical energy. "
                "Plants use carbon dioxide and water to produce glucose and oxygen."
            ),
            "keyConcepts": ["Light reactions", "Calvin cycle", "Chlorophyll"],
        },
        "quiz": [
            {
                "question": f"Question {index + 1} about photosynthesis?",
                "options": [
                    f"Option A for question {index + 1}",
                    f"Option B for question {index + 1}",
                    f"Option C for question {index + 1}",
                    f"Option D for question {index + 1}",
                ],
                "correctAnswer": index % 4,
                "explanation": f"Explanation for question {index + 1}.",
            }
            for index in range(5)
        ],
        "flashcards": [
            {"front": "What is photosynthesis?", "back": "Converting light to chemical energy."},
            {"front": "Where does it happen?", "back": "In chloroplasts."},
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
