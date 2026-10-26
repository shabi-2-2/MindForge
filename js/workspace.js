/**
 * MindForge study workspace
 * Owns the study form: live counters, custom validation, duplicate-submission
 * guarding, loading and error states. Completed mock generations are saved to
 * MindForgeHistory and handed to MindForgeLearning, which renders the
 * interactive Summary, Quiz and Flashcards tabs.
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

  function notify(message) {
    document.dispatchEvent(
      new CustomEvent('mindforge:notice', {
        detail: { message: message }
      })
    );
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
        result.quiz.questions.length > 0 &&
        Array.isArray(result.flashcards) &&
        result.config
    );
  }

  function renderResult(result, saved) {
    if (!global.MindForgeLearning) {
      throw new Error('The interactive result module did not load.');
    }

    global.MindForgeLearning.render(result, { saved: Boolean(saved) });

    if (resultSection) {
      resultSection.hidden = false;
    }
  }

  function revealResult() {
    if (resultTitle) {
      try {
        resultTitle.focus({ preventScroll: true });
      } catch (error) {
        resultTitle.focus();
      }
    }

    if (global.MindForgeLearning) {
      global.MindForgeLearning.reveal();
    } else if (resultSection && resultSection.scrollIntoView) {
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

        var saveResult = null;

        if (global.MindForgeHistory) {
          saveResult = global.MindForgeHistory.save(result);
        }

        var saved = Boolean(saveResult && saveResult.ok);
        var record = saveResult && saveResult.record ? saveResult.record : result;

        lastResult = record;
        setGenerating(false);
        renderResult(record, saved);
        revealResult();
        showStatus(
          'Study material ready — ' +
            record.quiz.questions.length +
            ' questions and ' +
            record.flashcards.length +
            (saved
              ? ' flashcards. Saved to History.'
              : ' flashcards generated locally.'),
          'success'
        );

        if (!saved) {
          notify('Generated locally, but History could not be saved in this browser.');
        }

        document.dispatchEvent(
          new CustomEvent('mindforge:studymaterialready', {
            detail: {
              result: record,
              saved: saved,
              reopened: false
            }
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

  function openSaved(record) {
    if (!isStructuredResult(record)) {
      showGenerationError(
        'That saved session is incomplete or damaged. Try another entry in History.'
      );
      return false;
    }

    if (!global.MindForgeLearning) {
      showGenerationError(
        'The interactive result module did not load. Refresh the page and try again.'
      );
      return false;
    }

    lastResult = record;
    setGenerating(false);
    clearGenerationError();
    hideStatus();
    renderResult(record, true);
    showStatus(
      'Reopened “' + record.summary.title + '” from History. Your progress is restored.',
      'success'
    );
    revealResult();

    document.dispatchEvent(
      new CustomEvent('mindforge:studymaterialready', {
        detail: {
          result: record,
          saved: true,
          reopened: true
        }
      })
    );

    return true;
  }

  function focusTopic() {
    try {
      topicInput.focus({ preventScroll: true });
    } catch (error) {
      topicInput.focus();
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
    openSaved: openSaved,
    focusTopic: focusTopic
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
