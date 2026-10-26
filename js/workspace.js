/**
 * MindForge study workspace
 * Owns the study form: configurable limits, live counters and warnings, request
 * validation, the idle/loading/success/error state machine, duplicate and
 * stale-response guards, and recoverable-error retry. Completed generations are
 * saved to MindForgeHistory and handed to MindForgeLearning, which renders the
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

  var contract = global.MindForgeContract;
  var topicCounter = form.querySelector('[data-topic-counter]');
  var notesCounter = form.querySelector('[data-notes-counter]');
  var topicWarning = form.querySelector('[data-topic-warning]');
  var notesWarning = form.querySelector('[data-notes-warning]');
  var topicHint = document.getElementById('study-topic-hint');
  var notesHint = document.getElementById('study-notes-hint');
  var submitLabel = form.querySelector('[data-generate-label]');
  var statusRegion = form.querySelector('[data-study-status]');
  var errorRegion = form.querySelector('[data-study-error]');
  var errorTitle = form.querySelector('[data-study-error-title]');
  var errorMessage = form.querySelector('[data-study-error-message]');
  var errorActions = form.querySelector('[data-study-error-actions]');
  var retryButton = form.querySelector('[data-study-retry]');

  var resultSection = document.getElementById('study-result');
  var resultTitle = resultSection && resultSection.querySelector('[data-result-title]');

  var reducedMotion = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
  var defaultLabel = 'Generate study material';
  var loadingLabel = 'Forging your session…';
  var generationState = 'idle';
  var requestSequence = 0;
  var lastResult = null;
  var lastDiagnostics = null;
  var fallbackLimits = { topic: 120, notes: 20000 };

  function getLimits() {
    if (contract && typeof contract.getLimits === 'function') {
      return contract.getLimits();
    }

    return fallbackLimits;
  }

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

  function getSettingsGroup(name) {
    return form.querySelector('[data-settings-group="' + name + '"]');
  }

  function setSettingsError(name, message) {
    var group = getSettingsGroup(name);

    if (!group) {
      return;
    }

    var error = group.querySelector('[data-settings-error]');
    var errorText = group.querySelector('[data-settings-error-text]');
    var inputs = group.querySelectorAll('input[type="radio"]');

    group.classList.toggle('has-error', Boolean(message));

    Array.prototype.forEach.call(inputs, function (input) {
      if (message) {
        input.setAttribute('aria-invalid', 'true');
      } else {
        input.removeAttribute('aria-invalid');
      }
    });

    if (errorText) {
      errorText.textContent = message || '';
    }

    if (error) {
      error.hidden = !message;
    }
  }

  function clearSettingsErrors() {
    setSettingsError('answer-style', '');
    setSettingsError('quiz-difficulty', '');
  }

  function setRetryVisible(visible) {
    if (errorActions) {
      errorActions.hidden = !visible;
    }

    if (retryButton) {
      retryButton.hidden = !visible;
    }
  }

  function clearGenerationError() {
    if (errorRegion) {
      errorRegion.hidden = true;
    }

    setRetryVisible(false);
  }

  function showGenerationError(message, options) {
    var settings = options || {};

    if (!errorRegion) {
      return;
    }

    if (errorTitle) {
      errorTitle.textContent = settings.title || 'The forge cooled down.';
    }

    if (errorMessage) {
      errorMessage.textContent = message;
    }

    errorRegion.hidden = false;
    setRetryVisible(Boolean(settings.recoverable));

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

  function updateCounter(input, counter, warning, maxLength) {
    if (!input || !counter) {
      return;
    }

    var length = input.value.length;
    var overLimit = length > maxLength;
    var nearLimit = !overLimit && length >= Math.ceil(maxLength * 0.9);

    counter.textContent = formatNumber(length) + ' / ' + formatNumber(maxLength);
    counter.classList.toggle('is-near-limit', nearLimit);
    counter.classList.toggle('is-over-limit', overLimit);

    if (!warning) {
      return;
    }

    warning.classList.toggle('is-over-limit', overLimit);

    if (overLimit) {
      warning.textContent =
        'Over the limit by ' +
        formatNumber(length - maxLength) +
        ' characters. Shorten this before generating.';
      warning.hidden = false;
    } else if (nearLimit) {
      warning.textContent = formatNumber(maxLength - length) + ' characters left';
      warning.hidden = false;
    } else {
      warning.textContent = '';
      warning.hidden = true;
    }
  }

  function syncCounters() {
    var limits = getLimits();

    updateCounter(topicInput, topicCounter, topicWarning, limits.topic);
    updateCounter(notesInput, notesCounter, notesWarning, limits.notes);

    topicInput.setAttribute('data-max-length', String(limits.topic));
    notesInput.setAttribute('data-max-length', String(limits.notes));

    if (topicHint) {
      topicHint.textContent =
        'A chapter, concept or question you want to work through. Up to ' +
        formatNumber(limits.topic) +
        ' characters; nothing is truncated.';
    }

    if (notesHint) {
      notesHint.textContent =
        'The local mock generator draws its summary and cards from these words. Up to ' +
        formatNumber(limits.notes) +
        ' characters; nothing is truncated.';
    }
  }

  function getLimit(name) {
    return getLimits()[name === 'topic' ? 'topic' : 'notes'];
  }

  function setGenerationState(nextState) {
    generationState = nextState;

    var loading = nextState === 'loading';

    form.setAttribute('data-generation-state', nextState);
    form.classList.toggle('is-generating', loading);
    form.setAttribute('aria-busy', loading ? 'true' : 'false');
    submitButton.disabled = loading;
    submitButton.setAttribute('aria-busy', loading ? 'true' : 'false');

    if (submitLabel) {
      submitLabel.textContent = loading ? loadingLabel : defaultLabel;
    }

    if (!loading && nextState !== 'error') {
      setRetryVisible(false);
    }
  }

  function getSelectedValue(name) {
    var checked = form.querySelector('input[name="' + name + '"]:checked');
    return checked ? checked.value : null;
  }

  function focusFirstSetting(name) {
    var group = getSettingsGroup(name);

    if (!group) {
      return;
    }

    var input = group.querySelector('input:checked') || group.querySelector('input');

    if (!input) {
      return;
    }

    try {
      input.focus({ preventScroll: true });
    } catch (error) {
      input.focus();
    }
  }

  function validate() {
    var firstInvalid = null;
    var firstInvalidGroup = null;

    clearGenerationError();
    setFieldError('topic', '');
    setFieldError('notes', '');
    clearSettingsErrors();

    if (!contract || typeof contract.validateRequest !== 'function') {
      setGenerationState('error');
      showGenerationError(
        'The study contract did not load. Refresh the page and try again.',
        {
          title: 'Validation is unavailable.',
          recoverable: false
        }
      );
      return null;
    }

    var validation = contract.validateRequest({
      topic: topicInput.value,
      notes: notesInput.value,
      answerStyle: getSelectedValue('answer-style'),
      difficulty: getSelectedValue('quiz-difficulty')
    });

    if (validation.ok) {
      return validation.value;
    }

    validation.errors.forEach(function (error) {
      if (error.field === 'topic') {
        setFieldError('topic', error.message);
        firstInvalid = firstInvalid || topicInput;
      } else if (error.field === 'notes') {
        setFieldError('notes', error.message);
        firstInvalid = firstInvalid || notesInput;
      } else if (error.field === 'answerStyle') {
        setSettingsError('answer-style', error.message);
        firstInvalidGroup = firstInvalidGroup || 'answer-style';
      } else if (error.field === 'difficulty') {
        setSettingsError('quiz-difficulty', error.message);
        firstInvalidGroup = firstInvalidGroup || 'quiz-difficulty';
      }
    });

    hideStatus();

    if (generationState === 'error') {
      setGenerationState('idle');
    }

    if (firstInvalid) {
      firstInvalid.focus();
    } else if (firstInvalidGroup) {
      focusFirstSetting(firstInvalidGroup);
    }

    return null;
  }

  function handleFieldInput(name) {
    var input = getFieldInput(name);
    var counter = name === 'topic' ? topicCounter : notesCounter;
    var warning = name === 'topic' ? topicWarning : notesWarning;
    var maxLength = getLimit(name);
    var trimmed = input.value.trim();

    updateCounter(input, counter, warning, maxLength);

    if (trimmed && trimmed.length <= maxLength) {
      setFieldError(name, '');
    }

    if (errorRegion && !errorRegion.hidden) {
      clearGenerationError();

      if (generationState === 'error') {
        setGenerationState('idle');
      }
    }
  }

  function handleSettingChange() {
    clearSettingsErrors();

    if (errorRegion && !errorRegion.hidden) {
      clearGenerationError();

      if (generationState === 'error') {
        setGenerationState('idle');
      }
    }
  }

  function normaliseResult(value) {
    if (contract && typeof contract.normaliseStoredResult === 'function') {
      return contract.normaliseStoredResult(value);
    }

    return null;
  }

  function isStructuredResult(result) {
    return Boolean(normaliseResult(result));
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

  function resultLabel(result) {
    if (
      result.summary &&
      typeof result.summary.title === 'string' &&
      result.summary.title
    ) {
      return result.summary.title;
    }

    if (typeof result.topic === 'string' && result.topic) {
      return result.topic;
    }

    var text = result.summary ? result.summary.text : '';
    return text ? text.slice(0, 60) + (text.length > 60 ? '…' : '') : 'saved session';
  }

  function errorInfo(error) {
    var code = error && error.code ? error.code : '';

    if (code === 'invalid-response') {
      return {
        title: 'The result could not be used.',
        message:
          'The generator returned study material that did not match the study contract. Your notes are safe — check them and try again.',
        recoverable: false
      };
    }

    if (code === 'invalid-request') {
      return {
        title: 'Check the session details.',
        message: 'Please fix the highlighted fields and try again.',
        recoverable: false
      };
    }

    if (code === 'provider-unavailable' || code === 'contract-unavailable') {
      return {
        title: 'Generation is unavailable.',
        message: 'Part of the local generator did not load. Refresh the page and try again.',
        recoverable: false
      };
    }

    return {
      title: 'The forge cooled down.',
      message:
        'Something interrupted the forge. Your notes are safe — check the details and try again.',
      recoverable: Boolean(error && error.recoverable)
    };
  }

  function startGeneration(values) {
    if (generationState === 'loading') {
      return;
    }

    var generation = global.MindForgeGeneration;

    if (!generation || typeof generation.generate !== 'function') {
      setGenerationState('error');
      showGenerationError(
        'The generation service did not load. Refresh the page and try again.',
        {
          title: 'Generation is unavailable.',
          recoverable: false
        }
      );
      return;
    }

    requestSequence += 1;

    var requestId = requestSequence;
    var payload = {
      topic: values.topic,
      notes: values.notes,
      answerStyle: values.answerStyle,
      difficulty: values.difficulty
    };
    var saved = false;

    lastDiagnostics = null;
    setGenerationState('loading');
    clearGenerationError();
    showStatus('Forging a summary, quiz and flashcards from your notes…', 'loading');

    Promise.resolve()
      .then(function () {
        return generation.generate(payload);
      })
      .then(function (result) {
        if (requestId !== requestSequence) {
          return;
        }

        var record = result;
        var saveResult = null;

        if (global.MindForgeHistory) {
          saveResult = global.MindForgeHistory.save(result);
        }

        saved = Boolean(saveResult && saveResult.ok);

        if (saved && saveResult.record) {
          record = saveResult.record;
        }

        lastResult = record;
        setGenerationState('success');
        clearGenerationError();
        renderResult(record, saved);
        revealResult();
        showStatus(
          'Study material ready — ' +
            record.quiz.length +
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
      .catch(function (error) {
        if (requestId !== requestSequence) {
          return;
        }

        var info = errorInfo(error);

        lastDiagnostics = error && error.diagnostics ? error.diagnostics : null;
        setGenerationState('error');
        hideStatus();
        showGenerationError(info.message, {
          title: info.title,
          recoverable: info.recoverable
        });

        if (global.MindForgeDebug && global.console && global.console.warn) {
          global.console.warn('[MindForge] Generation failed', {
            code: error && error.code,
            diagnostics: lastDiagnostics
          });
        }
      });
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (generationState === 'loading') {
      return;
    }

    var values = validate();

    if (!values) {
      return;
    }

    startGeneration(values);
  }

  function retryGeneration() {
    if (generationState === 'loading') {
      return;
    }

    var values = validate();

    if (!values) {
      return;
    }

    startGeneration(values);
  }

  function openSaved(record) {
    var normalised = normaliseResult(record);

    if (!normalised) {
      setGenerationState('error');
      showGenerationError(
        'That saved session is incomplete or damaged. Try another entry in History.',
        {
          title: 'This saved session cannot be opened.',
          recoverable: false
        }
      );
      return false;
    }

    if (!global.MindForgeLearning) {
      showGenerationError(
        'The interactive result module did not load. Refresh the page and try again.',
        {
          title: 'Results are unavailable.',
          recoverable: false
        }
      );
      return false;
    }

    requestSequence += 1;
    lastResult = normalised;
    lastDiagnostics = null;
    setGenerationState('success');
    clearGenerationError();
    hideStatus();
    renderResult(normalised, true);
    showStatus(
      'Reopened “' + resultLabel(normalised) + '” from History. Your progress is restored.',
      'success'
    );
    revealResult();

    document.dispatchEvent(
      new CustomEvent('mindforge:studymaterialready', {
        detail: {
          result: normalised,
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
    setGenerationState('idle');

    form.addEventListener('submit', handleSubmit);
    form.addEventListener('change', function (event) {
      var target = event.target;

      if (
        target &&
        (target.name === 'answer-style' || target.name === 'quiz-difficulty')
      ) {
        handleSettingChange();
      }
    });

    topicInput.addEventListener('input', function () {
      handleFieldInput('topic');
    });

    notesInput.addEventListener('input', function () {
      handleFieldInput('notes');
    });

    if (retryButton) {
      retryButton.addEventListener('click', retryGeneration);
    }

    document.addEventListener('mindforge:limitschange', syncCounters);
  }

  global.MindForgeWorkspace = Object.freeze({
    getLastResult: function () {
      return lastResult;
    },
    getGenerationState: function () {
      return generationState;
    },
    getLastDiagnostics: function () {
      return lastDiagnostics;
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
