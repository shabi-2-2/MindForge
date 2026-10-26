/**
 * MindForge study workspace
 * Owns the study form: live counters, custom validation, duplicate-submission
 * guarding, loading and error states, and a readable preview of the local mock
 * result. The generated result is exposed for Part 3 via
 * window.MindForgeWorkspace.getLastResult() and the
 * `mindforge:studymaterialready` document event.
 */
(function (global) {
  'use strict';

  var form = document.getElementById('study-form');

  if (!form) {
    return;
  }

  var topicInput = document.getElementById('study-topic');
  var notesInput = document.getElementById('study-notes');
  var submitButton = form.querySelector('[data-generate]');

  if (!topicInput || !notesInput || !submitButton) {
    return;
  }

  var topicCounter = form.querySelector('[data-topic-counter]');
  var notesCounter = form.querySelector('[data-notes-counter]');
  var submitLabel = form.querySelector('[data-generate-label]');
  var statusRegion = form.querySelector('[data-study-status]');
  var errorRegion = form.querySelector('[data-study-error]');
  var errorMessage = form.querySelector('[data-study-error-message]');

  var resultSection = document.getElementById('study-result');
  var resultTitle = resultSection && resultSection.querySelector('[data-result-title]');
  var resultMeta = resultSection && resultSection.querySelector('[data-result-meta]');
  var resultOverview = resultSection && resultSection.querySelector('[data-result-overview]');
  var resultKeyPoints =
    resultSection && resultSection.querySelector('[data-result-keypoints]');
  var resultQuiz = resultSection && resultSection.querySelector('[data-result-quiz]');
  var resultFlashcards =
    resultSection && resultSection.querySelector('[data-result-flashcards]');
  var resultTime = resultSection && resultSection.querySelector('[data-result-time]');
  var resultDifficulty =
    resultSection && resultSection.querySelector('[data-result-difficulty]');
  var resultCardCount =
    resultSection && resultSection.querySelector('[data-result-card-count]');

  var reducedMotion = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  var defaultLabel = 'Generate study material';
  var loadingLabel = 'Forging your session…';
  var isGenerating = false;
  var lastResult = null;

  function formatNumber(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function padTwo(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function createIcon(name, className) {
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    var use = document.createElementNS('http://www.w3.org/2000/svg', 'use');

    svg.setAttribute('class', 'icon' + (className ? ' ' + className : ''));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    use.setAttribute('href', '#icon-' + name);
    svg.appendChild(use);

    return svg;
  }

  function createSpinner() {
    var spinner = document.createElement('span');
    spinner.className = 'spinner';
    spinner.setAttribute('aria-hidden', 'true');
    return spinner;
  }

  function getField(name) {
    return form.querySelector('[data-field="' + name + '"]');
  }

  function getFieldInput(name) {
    return name === 'topic' ? topicInput : notesInput;
  }

  function setFieldError(name, message) {
    var field = getField(name);
    var input = getFieldInput(name);

    if (!field || !input) {
      return;
    }

    var error = field.querySelector('[data-field-error]');
    var errorText = field.querySelector('[data-field-error-text]');

    if (message) {
      field.classList.add('has-error');
      input.setAttribute('aria-invalid', 'true');

      if (errorText) {
        errorText.textContent = message;
      }

      if (error) {
        error.hidden = false;
      }
    } else {
      field.classList.remove('has-error');
      input.removeAttribute('aria-invalid');

      if (errorText) {
        errorText.textContent = '';
      }

      if (error) {
        error.hidden = true;
      }
    }
  }

  function clearGenerationError() {
    if (errorRegion) {
      errorRegion.hidden = true;
    }
  }

  function showGenerationError(message) {
    if (!errorRegion) {
      return;
    }

    if (errorMessage) {
      errorMessage.textContent = message;
    }

    errorRegion.hidden = false;

    try {
      errorRegion.focus();
    } catch (error) {
      /* Focus is an enhancement; the alert is announced either way. */
    }
  }

  function hideStatus() {
    if (!statusRegion) {
      return;
    }

    statusRegion.hidden = true;
    statusRegion.classList.remove('is-loading', 'is-success');
    statusRegion.textContent = '';
  }

  function showStatus(message, state) {
    if (!statusRegion) {
      return;
    }

    statusRegion.textContent = '';
    statusRegion.hidden = false;
    statusRegion.classList.toggle('is-loading', state === 'loading');
    statusRegion.classList.toggle('is-success', state === 'success');

    if (state === 'loading') {
      statusRegion.appendChild(createSpinner());
    } else {
      statusRegion.appendChild(createIcon('check-circle'));
    }

    var text = document.createElement('span');
    text.textContent = message;
    statusRegion.appendChild(text);
  }

  function updateCounter(input, counter, maxLength) {
    if (!input || !counter) {
      return;
    }

    var length = input.value.length;
    counter.textContent = formatNumber(length) + ' / ' + formatNumber(maxLength);
    counter.classList.toggle('is-near-limit', length >= maxLength * 0.9);
  }

  function syncCounters() {
    updateCounter(
      topicInput,
      topicCounter,
      Number(topicInput.getAttribute('maxlength')) || 120
    );
    updateCounter(
      notesInput,
      notesCounter,
      Number(notesInput.getAttribute('maxlength')) || 5000
    );
  }

  function setGenerating(value) {
    isGenerating = value;
    form.classList.toggle('is-generating', value);
    form.setAttribute('aria-busy', value ? 'true' : 'false');
    submitButton.disabled = value;
    submitButton.setAttribute('aria-busy', value ? 'true' : 'false');

    if (submitLabel) {
      submitLabel.textContent = value ? loadingLabel : defaultLabel;
    }
  }

  function getSelectedValue(name) {
    var checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  }

  function validate() {
    var topic = topicInput.value.trim();
    var notes = notesInput.value.trim();
    var firstInvalid = null;

    clearGenerationError();

    if (!topic) {
      setFieldError('topic', 'Give your session a topic before generating.');
      firstInvalid = topicInput;
    } else if (topic.length > 120) {
      setFieldError('topic', 'Keep the topic to 120 characters or fewer.');
      firstInvalid = topicInput;
    } else {
      setFieldError('topic', '');
    }

    if (!notes) {
      setFieldError('notes', 'Add a few notes so the forge has something to work with.');
      firstInvalid = firstInvalid || notesInput;
    } else if (notes.length > 5000) {
      setFieldError('notes', 'Keep your notes to 5,000 characters or fewer.');
      firstInvalid = firstInvalid || notesInput;
    } else {
      setFieldError('notes', '');
    }

    if (firstInvalid) {
      hideStatus();
      firstInvalid.focus();
      return null;
    }

    return {
      topic: topic,
      notes: notes
    };
  }

  function handleFieldInput(name) {
    var input = getFieldInput(name);
    var counter = name === 'topic' ? topicCounter : notesCounter;
    var maxLength =
      Number(input.getAttribute('maxlength')) || (name === 'topic' ? 120 : 5000);

    updateCounter(input, counter, maxLength);

    if (input.value.trim()) {
      setFieldError(name, '');
    }

    if (errorRegion && !errorRegion.hidden) {
      clearGenerationError();
    }
  }

  function isStructuredResult(result) {
    return Boolean(
      result &&
        result.summary &&
        typeof result.summary.title === 'string' &&
        typeof result.summary.overview === 'string' &&
        Array.isArray(result.summary.keyPoints) &&
        result.quiz &&
        Array.isArray(result.quiz.questions) &&
        Array.isArray(result.flashcards) &&
        result.config
    );
  }

  function renderKeyPoints(points) {
    if (!resultKeyPoints) {
      return;
    }

    resultKeyPoints.textContent = '';

    points.forEach(function (point) {
      var item = document.createElement('li');
      var text = document.createElement('span');

      item.appendChild(createIcon('check'));
      text.textContent = point;
      item.appendChild(text);
      resultKeyPoints.appendChild(item);
    });
  }

  function renderQuiz(quiz) {
    if (!resultQuiz) {
      return;
    }

    resultQuiz.textContent = '';

    quiz.questions.forEach(function (question, questionIndex) {
      var item = document.createElement('li');
      item.className = 'quiz-preview';

      var prompt = document.createElement('p');
      prompt.className = 'quiz-preview__prompt';

      var number = document.createElement('span');
      number.className = 'quiz-preview__num';
      number.textContent = padTwo(questionIndex + 1);

      var promptText = document.createElement('span');
      promptText.textContent = question.prompt;

      prompt.appendChild(number);
      prompt.appendChild(promptText);
      item.appendChild(prompt);

      var options = document.createElement('ol');
      options.className = 'quiz-preview__options';

      question.options.forEach(function (option, optionIndex) {
        var optionItem = document.createElement('li');
        var isCorrect = optionIndex === question.answerIndex;

        optionItem.className =
          'quiz-preview__option' + (isCorrect ? ' is-correct' : '');

        var letter = document.createElement('span');
        letter.className = 'quiz-preview__letter';
        letter.setAttribute('aria-hidden', 'true');
        letter.textContent = String.fromCharCode(65 + optionIndex);

        var text = document.createElement('span');
        text.textContent = option;

        optionItem.appendChild(letter);
        optionItem.appendChild(text);

        if (isCorrect) {
          var correctLabel = document.createElement('span');
          correctLabel.className = 'sr-only';
          correctLabel.textContent = ' Correct answer.';
          optionItem.appendChild(correctLabel);
        }

        options.appendChild(optionItem);
      });

      item.appendChild(options);

      var explanation = document.createElement('p');
      explanation.className = 'quiz-preview__explain';

      var why = document.createElement('strong');
      why.textContent = 'Why: ';
      explanation.appendChild(why);
      explanation.appendChild(document.createTextNode(question.explanation));
      item.appendChild(explanation);

      resultQuiz.appendChild(item);
    });
  }

  function renderFlashcards(cards) {
    if (!resultFlashcards) {
      return;
    }

    resultFlashcards.textContent = '';

    cards.forEach(function (card, index) {
      var item = document.createElement('li');
      item.className = 'flashcard-preview';

      var head = document.createElement('div');
      head.className = 'flashcard-preview__head';

      var number = document.createElement('span');
      number.className = 'flashcard-preview__index';
      number.textContent = padTwo(index + 1);

      var label = document.createElement('span');
      label.className = 'flashcard-preview__label';
      label.textContent = 'Card';

      head.appendChild(number);
      head.appendChild(label);

      var front = document.createElement('p');
      front.className = 'flashcard-preview__front';
      front.textContent = card.front;

      var back = document.createElement('p');
      back.className = 'flashcard-preview__back';

      var backLabel = document.createElement('span');
      backLabel.className = 'flashcard-preview__back-label';
      backLabel.textContent = 'Back';

      var backText = document.createElement('span');
      backText.textContent = card.back;

      back.appendChild(backLabel);
      back.appendChild(backText);

      item.appendChild(head);
      item.appendChild(front);
      item.appendChild(back);
      resultFlashcards.appendChild(item);
    });
  }

  function renderResult(result) {
    if (resultTitle) {
      resultTitle.textContent = result.summary.title;
    }

    if (resultMeta) {
      resultMeta.textContent = [
        result.config.answerStyleLabel,
        result.config.difficultyLabel + ' difficulty',
        result.quiz.questions.length + ' questions',
        result.flashcards.length + ' flashcards',
        'about ' + result.summary.estimatedMinutes + ' min'
      ].join(' · ');
    }

    if (resultOverview) {
      resultOverview.textContent = result.summary.overview;
    }

    if (resultTime) {
      resultTime.textContent = '~' + result.summary.estimatedMinutes + ' min';
    }

    if (resultDifficulty) {
      resultDifficulty.textContent = result.config.difficultyLabel;
    }

    if (resultCardCount) {
      resultCardCount.textContent = result.flashcards.length + ' cards';
    }

    renderKeyPoints(result.summary.keyPoints);
    renderQuiz(result.quiz);
    renderFlashcards(result.flashcards);

    if (resultSection) {
      resultSection.hidden = false;
    }
  }

  function revealResult() {
    if (!resultSection) {
      return;
    }

    if (resultTitle) {
      try {
        resultTitle.focus({ preventScroll: true });
      } catch (error) {
        resultTitle.focus();
      }
    }

    if (resultSection.scrollIntoView) {
      var behavior = reducedMotion && reducedMotion.matches ? 'auto' : 'smooth';
      resultSection.scrollIntoView({ behavior: behavior, block: 'start' });
    }
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (isGenerating) {
      return;
    }

    var values = validate();

    if (!values) {
      return;
    }

    var engine = global.MindForgeGenerator;

    if (!engine || typeof engine.generate !== 'function') {
      showGenerationError(
        'The local generator did not load. Refresh the page and try again.'
      );
      return;
    }

    var payload = {
      topic: values.topic,
      notes: values.notes,
      answerStyle: getSelectedValue('answer-style') || 'exam',
      difficulty: getSelectedValue('quiz-difficulty') || 'medium'
    };
    var request;

    setGenerating(true);
    clearGenerationError();

    try {
      request = engine.generate(payload);
    } catch (error) {
      setGenerating(false);
      hideStatus();
      showGenerationError(
        'Something interrupted the forge. Your notes are safe — check the details and try again.'
      );
      return;
    }

    showStatus('Forging a summary, quiz and flashcards from your notes…', 'loading');

    Promise.resolve(request)
      .then(function (result) {
        if (!isStructuredResult(result)) {
          throw new Error('The generator returned an incomplete result.');
        }

        lastResult = result;
        setGenerating(false);
        renderResult(result);
        showStatus(
          'Study material ready — ' +
            result.quiz.questions.length +
            ' questions and ' +
            result.flashcards.length +
            ' flashcards generated locally.',
          'success'
        );
        revealResult();

        document.dispatchEvent(
          new CustomEvent('mindforge:studymaterialready', {
            detail: { result: result }
          })
        );
      })
      .catch(function () {
        setGenerating(false);
        hideStatus();
        showGenerationError(
          'The forge cooled down before it could finish. Your notes are safe — check the details and try again.'
        );
      });
  }

  function focusTopic() {
    var focus = function () {
      try {
        topicInput.focus({ preventScroll: true });
      } catch (error) {
        topicInput.focus();
      }
    };

    if (global.requestAnimationFrame) {
      global.requestAnimationFrame(focus);
    } else {
      global.setTimeout(focus, 0);
    }
  }

  function init() {
    syncCounters();
    setGenerating(false);
    form.addEventListener('submit', handleSubmit);

    topicInput.addEventListener('input', function () {
      handleFieldInput('topic');
    });

    notesInput.addEventListener('input', function () {
      handleFieldInput('notes');
    });
  }

  global.MindForgeWorkspace = Object.freeze({
    getLastResult: function () {
      return lastResult;
    },
    focusTopic: focusTopic
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
