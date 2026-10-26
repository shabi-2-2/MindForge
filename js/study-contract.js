/**
 * MindForge study contract
 * One place for the configurable request limits, request validation and the
 * runtime validation of generated study material. The module has no DOM or
 * network dependencies beyond an optional limits-change event, so it can be
 * loaded before the history store, the mock provider and the workspace.
 */
(function (global) {
  'use strict';

  var DEFAULT_LIMITS = {
    topic: 120,
    notes: 20000
  };

  var ANSWER_STYLES = ['kid', 'exam', 'detailed'];
  var DIFFICULTIES = ['easy', 'medium', 'hard'];
  var QUIZ_QUESTION_COUNT = 5;
  var OPTION_COUNT = 4;

  var limits = {
    topic: DEFAULT_LIMITS.topic,
    notes: DEFAULT_LIMITS.notes
  };

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  function isFiniteNumber(value) {
    return typeof value === 'number' && isFinite(value);
  }

  function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
  }

  function clone(value) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function formatNumber(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function getLimits() {
    return {
      topic: limits.topic,
      notes: limits.notes
    };
  }

  function configure(overrides) {
    if (isObject(overrides)) {
      ['topic', 'notes'].forEach(function (key) {
        var value = Number(overrides[key]);

        if (isFiniteNumber(value) && value > 0) {
          limits[key] = Math.floor(value);
        }
      });
    }

    if (global.document && typeof global.CustomEvent === 'function') {
      global.document.dispatchEvent(
        new global.CustomEvent('mindforge:limitschange', {
          detail: { limits: getLimits() }
        })
      );
    }

    return getLimits();
  }

  function addRequestError(errors, field, code, message) {
    errors.push({
      field: field,
      code: code,
      message: message
    });
  }

  function validateRequest(input) {
    var errors = [];
    var source = isObject(input) ? input : {};
    var value = {
      topic: '',
      notes: '',
      answerStyle: '',
      difficulty: ''
    };
    var topic =
      typeof source.topic === 'string' ? source.topic.trim() : '';
    var notes =
      typeof source.notes === 'string' ? source.notes.trim() : '';

    if (!topic) {
      addRequestError(
        errors,
        'topic',
        'required',
        'Enter a topic before generating.'
      );
    } else if (topic.length > limits.topic) {
      addRequestError(
        errors,
        'topic',
        'too-long',
        'Keep the topic to ' +
          formatNumber(limits.topic) +
          ' characters or fewer (' +
          formatNumber(topic.length) +
          ' entered).'
      );
    } else {
      value.topic = topic;
    }

    if (!notes) {
      addRequestError(
        errors,
        'notes',
        'required',
        'Add some notes before generating.'
      );
    } else if (notes.length > limits.notes) {
      addRequestError(
        errors,
        'notes',
        'too-long',
        'Keep your notes to ' +
          formatNumber(limits.notes) +
          ' characters or fewer (' +
          formatNumber(notes.length) +
          ' entered).'
      );
    } else {
      value.notes = notes;
    }

    if (ANSWER_STYLES.indexOf(source.answerStyle) === -1) {
      addRequestError(
        errors,
        'answerStyle',
        'invalid-setting',
        'Choose a valid answer style before generating.'
      );
    } else {
      value.answerStyle = source.answerStyle;
    }

    if (DIFFICULTIES.indexOf(source.difficulty) === -1) {
      addRequestError(
        errors,
        'difficulty',
        'invalid-setting',
        'Choose a valid quiz difficulty before generating.'
      );
    } else {
      value.difficulty = source.difficulty;
    }

    return {
      ok: errors.length === 0,
      value: errors.length === 0 ? value : null,
      errors: errors,
      diagnostics: {
        errorCount: errors.length,
        fields: errors.map(function (error) {
          return {
            field: error.field,
            code: error.code
          };
        })
      }
    };
  }

  function addResponseError(errors, path, code, message) {
    errors.push({
      path: path,
      code: code,
      message: message
    });
  }

  function uniqueId(rawId, prefix, index, used) {
    var base =
      isNonEmptyString(rawId) ? rawId.trim() : prefix + (index + 1);
    var id = base;
    var suffix = 2;

    while (used[id]) {
      id = base + '-' + suffix;
      suffix += 1;
    }

    used[id] = true;
    return id;
  }

  function validateSummary(summary, errors) {
    var value = null;

    if (!isObject(summary)) {
      addResponseError(
        errors,
        'summary',
        'invalid-type',
        'summary must be an object.'
      );
      return value;
    }

    var text = typeof summary.text === 'string' ? summary.text.trim() : '';
    var concepts = summary.keyConcepts;
    var keyConcepts = [];

    if (!text) {
      addResponseError(
        errors,
        'summary.text',
        'required',
        'summary.text must be a non-empty string.'
      );
    }

    if (!Array.isArray(concepts) || concepts.length === 0) {
      addResponseError(
        errors,
        'summary.keyConcepts',
        'required',
        'summary.keyConcepts must be a non-empty array.'
      );
    } else {
      concepts.forEach(function (concept, index) {
        if (!isNonEmptyString(concept)) {
          addResponseError(
            errors,
            'summary.keyConcepts[' + index + ']',
            'invalid-value',
            'Every key concept must be a non-empty string.'
          );
        } else {
          keyConcepts.push(concept.trim());
        }
      });
    }

    if (
      text &&
      Array.isArray(concepts) &&
      keyConcepts.length === concepts.length
    ) {
      value = {
        text: text,
        keyConcepts: keyConcepts
      };

      if (isNonEmptyString(summary.title)) {
        value.title = summary.title.trim();
      }

      if (
        isFiniteNumber(summary.estimatedMinutes) &&
        summary.estimatedMinutes > 0
      ) {
        value.estimatedMinutes = Math.round(summary.estimatedMinutes);
      }
    }

    return value;
  }

  function validateQuiz(quiz, errors) {
    var questions = [];

    if (!Array.isArray(quiz)) {
      addResponseError(
        errors,
        'quiz',
        'invalid-type',
        'quiz must be an array.'
      );
      return questions;
    }

    if (quiz.length !== QUIZ_QUESTION_COUNT) {
      addResponseError(
        errors,
        'quiz',
        'invalid-length',
        'quiz must contain exactly ' +
          QUIZ_QUESTION_COUNT +
          ' questions (received ' +
          quiz.length +
          ').'
      );
    }

    var usedIds = Object.create(null);

    quiz.forEach(function (question, index) {
      var path = 'quiz[' + index + ']';

      if (!isObject(question)) {
        addResponseError(
          errors,
          path,
          'invalid-type',
          'Every quiz question must be an object.'
        );
        return;
      }

      var questionText =
        typeof question.question === 'string'
          ? question.question.trim()
          : '';
      var explanation =
        typeof question.explanation === 'string'
          ? question.explanation.trim()
          : '';
      var options = question.options;
      var optionTexts = [];

      if (!questionText) {
        addResponseError(
          errors,
          path + '.question',
          'required',
          'Every quiz question needs non-empty text.'
        );
      }

      if (!Array.isArray(options) || options.length !== OPTION_COUNT) {
        addResponseError(
          errors,
          path + '.options',
          'invalid-length',
          'Every quiz question needs exactly ' +
            OPTION_COUNT +
            ' options.'
        );
      } else {
        options.forEach(function (option, optionIndex) {
          if (!isNonEmptyString(option)) {
            addResponseError(
              errors,
              path + '.options[' + optionIndex + ']',
              'invalid-value',
              'Every option must be a non-empty string.'
            );
          } else {
            optionTexts.push(option.trim());
          }
        });
      }

      if (
        !isFiniteNumber(question.correctAnswer) ||
        Math.floor(question.correctAnswer) !== question.correctAnswer ||
        question.correctAnswer < 0 ||
        question.correctAnswer >= OPTION_COUNT
      ) {
        addResponseError(
          errors,
          path + '.correctAnswer',
          'invalid-index',
          'correctAnswer must be an integer from 0 through ' +
            (OPTION_COUNT - 1) +
            '.'
        );
      }

      if (!explanation) {
        addResponseError(
          errors,
          path + '.explanation',
          'required',
          'Every quiz question needs a non-empty explanation.'
        );
      }

      if (
        questionText &&
        optionTexts.length === OPTION_COUNT &&
        explanation &&
        isFiniteNumber(question.correctAnswer) &&
        Math.floor(question.correctAnswer) === question.correctAnswer &&
        question.correctAnswer >= 0 &&
        question.correctAnswer < OPTION_COUNT
      ) {
        questions.push({
          id: uniqueId(question.id, 'q', index, usedIds),
          question: questionText,
          options: optionTexts,
          correctAnswer: question.correctAnswer,
          explanation: explanation
        });
      }
    });

    return questions;
  }

  function validateFlashcards(flashcards, errors) {
    var cards = [];

    if (!Array.isArray(flashcards) || flashcards.length === 0) {
      addResponseError(
        errors,
        'flashcards',
        'required',
        'flashcards must be a non-empty array.'
      );
      return cards;
    }

    var usedIds = Object.create(null);

    flashcards.forEach(function (card, index) {
      var path = 'flashcards[' + index + ']';

      if (!isObject(card)) {
        addResponseError(
          errors,
          path,
          'invalid-type',
          'Every flashcard must be an object.'
        );
        return;
      }

      var front = typeof card.front === 'string' ? card.front.trim() : '';
      var back = typeof card.back === 'string' ? card.back.trim() : '';

      if (!front) {
        addResponseError(
          errors,
          path + '.front',
          'required',
          'Every flashcard needs a non-empty front.'
        );
      }

      if (!back) {
        addResponseError(
          errors,
          path + '.back',
          'required',
          'Every flashcard needs a non-empty back.'
        );
      }

      if (front && back) {
        cards.push({
          id: uniqueId(card.id, 'fc', index, usedIds),
          front: front,
          back: back
        });
      }
    });

    return cards;
  }

  function receivedShape(data) {
    var summary = isObject(data) ? data.summary : null;
    var quiz = isObject(data) ? data.quiz : null;
    var flashcards = isObject(data) ? data.flashcards : null;

    return {
      summary: isObject(summary) ? 'object' : typeof summary,
      quiz: Array.isArray(quiz) ? 'array(' + quiz.length + ')' : typeof quiz,
      flashcards:
        Array.isArray(flashcards) && flashcards
          ? 'array(' + flashcards.length + ')'
          : typeof flashcards
    };
  }

  function validateResponse(data) {
    var errors = [];

    if (!isObject(data)) {
      addResponseError(
        errors,
        'response',
        'invalid-type',
        'The generated result must be an object.'
      );

      return {
        ok: false,
        value: null,
        errors: errors,
        diagnostics: {
          errorCount: errors.length,
          errors: errors,
          received: receivedShape(data)
        }
      };
    }

    var summary = validateSummary(data.summary, errors);
    var quiz = validateQuiz(data.quiz, errors);
    var flashcards = validateFlashcards(data.flashcards, errors);
    var value = null;

    if (errors.length === 0) {
      value = {
        summary: summary,
        quiz: quiz,
        flashcards: flashcards
      };

      [
        'id',
        'createdAt',
        'topic',
        'notes',
        'config',
        'meta',
        'progress',
        'savedAt',
        'updatedAt'
      ].forEach(function (key) {
        if (hasOwn(data, key) && data[key] !== undefined) {
          value[key] = isObject(data[key]) ? clone(data[key]) : data[key];
        }
      });
    }

    return {
      ok: errors.length === 0,
      value: value,
      errors: errors,
      diagnostics: {
        errorCount: errors.length,
        errors: errors.slice(0, 25),
        received: receivedShape(data)
      }
    };
  }

  function migrateLegacyResult(data) {
    if (!isObject(data)) {
      return null;
    }

    var copy = clone(data);

    if (!isObject(copy)) {
      return null;
    }

    if (isObject(copy.summary)) {
      if (
        !isNonEmptyString(copy.summary.text) &&
        isNonEmptyString(copy.summary.overview)
      ) {
        copy.summary.text = copy.summary.overview;
      }

      if (
        (!Array.isArray(copy.summary.keyConcepts) ||
          copy.summary.keyConcepts.length === 0) &&
        Array.isArray(copy.summary.keyPoints)
      ) {
        copy.summary.keyConcepts = copy.summary.keyPoints;
      }
    }

    if (isObject(copy.quiz) && Array.isArray(copy.quiz.questions)) {
      copy.quiz = copy.quiz.questions.map(function (question) {
        if (!isObject(question)) {
          return question;
        }

        return {
          id: question.id,
          question:
            question.question !== undefined
              ? question.question
              : question.prompt,
          options: question.options,
          correctAnswer:
            question.correctAnswer !== undefined
              ? question.correctAnswer
              : question.answerIndex,
          explanation: question.explanation
        };
      });
    }

    return copy;
  }

  function normaliseStoredResult(data) {
    var migrated = migrateLegacyResult(data);

    if (!migrated) {
      return null;
    }

    var validation = validateResponse(migrated);

    return validation.ok ? validation.value : null;
  }

  global.MindForgeContract = Object.freeze({
    LIMITS: DEFAULT_LIMITS,
    ANSWER_STYLES: ANSWER_STYLES.slice(),
    DIFFICULTIES: DIFFICULTIES.slice(),
    QUIZ_QUESTION_COUNT: QUIZ_QUESTION_COUNT,
    OPTION_COUNT: OPTION_COUNT,
    getLimits: getLimits,
    configure: configure,
    validateRequest: validateRequest,
    validateResponse: validateResponse,
    normaliseStoredResult: normaliseStoredResult
  });
})(window);
