"""Semantic quality checks for generated study material.

Pydantic enforces the response contract shape. These checks catch content
problems the schema cannot express: repeated questions or cards, duplicate
options and content that is technically non-empty but too thin to be useful.

The checks are deterministic and deliberately conservative. They do not verify
factual correctness and cannot prove that a question has one defensible answer;
that remains the responsibility of the prompt and the provider.
"""

from __future__ import annotations

import re
from typing import Iterable, List

from ..schemas import GenerateResponse


MIN_SUMMARY_CHARS = 40
MIN_KEY_CONCEPTS = 3
MAX_KEY_CONCEPTS = 10
MIN_QUESTION_CHARS = 10
MIN_EXPLANATION_CHARS = 15
MIN_FLASHCARDS = 3
MAX_FLASHCARDS = 12
NEAR_DUPLICATE_SIMILARITY = 0.8

# Common English words carry little topical meaning, so they are ignored when
# comparing question stems. This keeps "What is X?" and "How does X work?"
# distinct while still catching reworded duplicates.
_STOPWORDS = frozenset(
    """
    a an the and or but if then than that this these those
    is are was were be been being am do does did doing done
    have has had having can could should would may might must
    of to in on at by for from with about into over under
    what which who whom whose when where why how
    it its they their them we our you your i me my
    following statement statements
    """.split()
)


class QualityIssue(Exception):
    """A content-quality failure with a stable, non-sensitive reason code."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _normalise(text: str) -> str:
    text = re.sub(r"[^\w\s]", " ", text.casefold())
    return re.sub(r"\s+", " ", text).strip()


def _content_tokens(text: str) -> frozenset[str]:
    return frozenset(
        token
        for token in re.findall(r"[a-z0-9]+", text.casefold())
        if len(token) > 1 and token not in _STOPWORDS
    )


def _similarity(left: str, right: str) -> float:
    """Jaccard similarity over meaningful tokens."""
    left_tokens = _content_tokens(left)
    right_tokens = _content_tokens(right)

    if not left_tokens or not right_tokens:
        return 1.0 if _normalise(left) == _normalise(right) else 0.0

    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def _has_duplicate(values: Iterable[str], *, near: bool = True) -> bool:
    seen: List[str] = []

    for value in values:
        normalised = _normalise(value)

        for previous in seen:
            if normalised == previous:
                return True
            if near and _similarity(normalised, previous) >= NEAR_DUPLICATE_SIMILARITY:
                return True

        seen.append(normalised)

    return False


def validate_response_quality(response: GenerateResponse) -> None:
    """Raise :class:`QualityIssue` when content is too thin or repetitive."""

    summary = response.summary
    if len(summary.text.strip()) < MIN_SUMMARY_CHARS:
        raise QualityIssue("summary_too_short")

    concepts = summary.keyConcepts
    if len(concepts) < MIN_KEY_CONCEPTS:
        raise QualityIssue("too_few_key_concepts")
    if len(concepts) > MAX_KEY_CONCEPTS:
        raise QualityIssue("too_many_key_concepts")
    if _has_duplicate(concepts, near=False):
        raise QualityIssue("duplicate_key_concepts")

    questions: List[str] = []
    for item in response.quiz:
        if len(item.question.strip()) < MIN_QUESTION_CHARS:
            raise QualityIssue("question_too_short")
        if len(item.explanation.strip()) < MIN_EXPLANATION_CHARS:
            raise QualityIssue("explanation_too_short")
        if _has_duplicate(item.options, near=False):
            raise QualityIssue("duplicate_options")
        questions.append(item.question)

    if _has_duplicate(questions):
        raise QualityIssue("duplicate_questions")

    flashcards = response.flashcards
    if len(flashcards) < MIN_FLASHCARDS:
        raise QualityIssue("too_few_flashcards")
    if len(flashcards) > MAX_FLASHCARDS:
        raise QualityIssue("too_many_flashcards")
    if _has_duplicate((card.front for card in flashcards)):
        raise QualityIssue("duplicate_flashcards")
