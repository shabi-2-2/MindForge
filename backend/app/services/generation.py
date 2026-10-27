from typing import Dict, Any
from ..schemas import GenerateRequest, GenerateResponse


class MockGenerationService:
    def generate(self, request: GenerateRequest) -> Dict[str, Any]:
        topic = request.topic
        notes = request.notes
        answer_style = request.answerStyle
        difficulty = request.difficulty
        
        # Create deterministic mock content based on topic
        topic_display = topic.title()
        
        summary_text = f"This session covers {topic_display}. The material focuses on core concepts and practical applications based on the provided notes. Key ideas are organized to help with retention and understanding."
        
        if answer_style.value == "kid":
            summary_text = f"Let's learn about {topic_display} in simple terms! Think of it like building blocks - we start with the basics and build up to understand the bigger picture."
            key_concepts = ["Big Idea", "Simple Example", "Practice Makes Sense"]
        elif answer_style.value == "detailed":
            summary_text = f"A comprehensive examination of {topic_display} reveals interconnected concepts. Understanding these relationships is crucial for deeper comprehension and effective application in various contexts."
            key_concepts = ["Core Definition", "Historical Context", "Key Principles", "Practical Applications", "Critical Considerations"]
        else:  # exam
            summary_text = f"Focus on {topic_display}: the central concept, supporting details most likely to appear on assessments, and connections between related ideas."
            key_concepts = ["Definition", "Key Components", "Important Distinctions", "Common Pitfalls"]
        
        quiz_questions = []
        for i in range(5):
            quiz_questions.append({
                "question": f"Question {i+1}: Which statement best describes an important aspect of {topic_display}?",
                "options": [
                    f"Option A relates to core concept {i+1}",
                    f"Option B relates to supporting detail {i+1}",
                    f"Option C relates to common misconception {i+1}",
                    f"Option D relates to practical application {i+1}",
                ],
                "correctAnswer": i % 4,
                "explanation": f"The correct answer highlights a key principle of {topic_display} as it relates to the material covered in your notes.",
            })
        
        if difficulty.value == "easy":
            flashcard_count = 4
        elif difficulty.value == "hard":
            flashcard_count = 6
        else:  # medium
            flashcard_count = 5
        
        flashcards = []
        for i in range(flashcard_count):
            flashcards.append({
                "front": f"Concept {i+1}: What do you recall about {topic_display}?",
                "back": f"Definition and explanation for concept {i+1} related to {topic_display} based on your notes.",
            })
        
        result = {
            "summary": {
                "text": summary_text,
                "keyConcepts": key_concepts,
            },
            "quiz": quiz_questions,
            "flashcards": flashcards,
        }
        
        # Validate the output with Pydantic schema
        validated = GenerateResponse(**result)
        return validated.model_dump()


mock_service = MockGenerationService()
