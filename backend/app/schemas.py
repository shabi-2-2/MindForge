from enum import Enum
from typing import List
from pydantic import BaseModel, Field, StrictInt, field_validator


class AnswerStyle(str, Enum):
    KID = "kid"
    EXAM = "exam"
    DETAILED = "detailed"


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class GenerateRequest(BaseModel):
    topic: str = Field(..., min_length=1)
    notes: str = Field(..., min_length=1)
    answerStyle: AnswerStyle
    difficulty: Difficulty

    @field_validator("topic", "notes", mode="before")
    @classmethod
    def trim_strings(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("topic")
    @classmethod
    def validate_topic_length(cls, v):
        if not v:  # after stripping
            raise ValueError("topic cannot be empty")
        if len(v) > 120:
            raise ValueError("topic exceeds maximum length of 120 characters")
        return v

    @field_validator("notes")
    @classmethod
    def validate_notes_length(cls, v):
        if not v:  # after stripping
            raise ValueError("notes cannot be empty")
        if len(v) > 20000:
            raise ValueError("notes exceeds maximum length of 20000 characters")
        return v


class QuizQuestion(BaseModel):
    question: str = Field(..., min_length=1)
    options: List[str] = Field(..., min_length=4, max_length=4)
    correctAnswer: StrictInt = Field(..., ge=0, le=3)
    explanation: str = Field(..., min_length=1)

    @field_validator("options")
    @classmethod
    def validate_options_non_empty(cls, v):
        for opt in v:
            if not isinstance(opt, str) or not opt.strip():
                raise ValueError("All options must be non-empty strings")
        return [opt.strip() for opt in v]

    @field_validator("question", "explanation", mode="before")
    @classmethod
    def trim_question_explanation(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v


class Summary(BaseModel):
    text: str = Field(..., min_length=1)
    keyConcepts: List[str] = Field(..., min_length=1)

    @field_validator("text", mode="before")
    @classmethod
    def trim_text(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("keyConcepts")
    @classmethod
    def validate_key_concepts(cls, v):
        if not v:
            raise ValueError("keyConcepts must be non-empty")
        result = []
        for concept in v:
            if not isinstance(concept, str) or not concept.strip():
                raise ValueError("All key concepts must be non-empty strings")
            result.append(concept.strip())
        return result


class Flashcard(BaseModel):
    front: str = Field(..., min_length=1)
    back: str = Field(..., min_length=1)

    @field_validator("front", "back", mode="before")
    @classmethod
    def trim_flashcard(cls, v):
        if isinstance(v, str):
            return v.strip()
        return v


class GenerateResponse(BaseModel):
    summary: Summary
    quiz: List[QuizQuestion] = Field(..., min_length=5, max_length=5)
    flashcards: List[Flashcard] = Field(..., min_length=1)
