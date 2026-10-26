/**
 * MindForge interactive learning results
 * Owns the Summary / Quiz / Flashcards tabs, clipboard and download actions,
 * one-shot quiz scoring, flashcard flipping and mastery tracking. Progress is
 * persisted through MindForgeHistory so a saved generation can be reopened with
 * its answers and known cards intact.
 */
(function (global) {
  'use strict';

  var resultSection = document.getElementById('study-result');

  if (!resultSection) {
    return;
  }

  var stored = global.MindForgeStorage;
  var history = global.MindForgeHistory;
  var reducedMotion = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

  var titleElement = resultSection.querySelector('[data-result-title]');
  var metaElement = resultSection.querySelector('[data-result-meta]');
  var saveState = resultSection.querySelector('[data-result-save-state]');
  var tabButtons = Array.prototype.slice.call(
    resultSection.querySelectorAll('[data-result-tab]')
  );
  var panels = Array.prototype.slice.call(
    resultSection.querySelectorAll('[data-result-panel]')
  );
  var summaryOverview = resultSection.querySelector('[data-result-overview]');
  var summaryPoints = resultSection.querySelector('[data-result-keypoints]');
  var summaryTime = resultSection.querySelector('[data-result-time]');
  var summaryCopy = resultSection.querySelector('[data-summary-copy]');
  var summaryDownload = resultSection.querySelector('[data-summary-download]');
  var summaryStatus = resultSection.querySelector('[data-summary-status]');
  var quizDifficulty = resultSection.querySelector('[data-result-difficulty]');
  var quizList = resultSection.querySelector('[data-result-quiz]');
  var quizProgress = resultSection.querySelector('[data-quiz-progress]');
  var quizScore = resultSection.querySelector('[data-quiz-score]');
  var quizComplete = resultSection.querySelector('[data-quiz-complete]');
  var quizCompleteScore = resultSection.querySelector('[data-quiz-complete-score]');
  var quizCompletePercent = resultSection.querySelector('[data-quiz-complete-percent]');
  var quizRestart = resultSection.querySelector('[data-quiz-restart]');
  var quizLive = resultSection.querySelector('[data-quiz-live]');
  var cardCount = resultSection.querySelector('[data-result-card-count]');
  var flashcardList = resultSection.querySelector('[data-result-flashcards]');
  var masteredCount = resultSection.querySelector('[data-flashcard-mastered]');
  var flashcardLive = resultSection.querySelector('[data-flashcard-live]');

  var current = null;
  var quizAnswers = Object.create(null);
  var knownCards = Object.create(null);
  var activeTab = 'summary';
  var copyTimer = null;

  function configFor(result) {
    var config = result && result.config ? result.config : {};

    return {
      answerStyleLabel:
        typeof config.answerStyleLabel === 'string' && config.answerStyleLabel
          ? config.answerStyleLabel
          : 'Study material',
      difficultyLabel:
        typeof config.difficultyLabel === 'string' && config.difficultyLabel
          ? config.difficultyLabel
          : 'Medium'
    };
  }

  function titleFor(result) {
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
    return text ? text.slice(0, 60) + (text.length > 60 ? '…' : '') : 'Study session';
  }

  function minutesFor(result) {
    return result.summary &&
      typeof result.summary.estimatedMinutes === 'number' &&
      result.summary.estimatedMinutes > 0
      ? Math.round(result.summary.estimatedMinutes)
      : null;
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

  function padTwo(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function notify(message) {
    document.dispatchEvent(
      new CustomEvent('mindforge:notice', {
        detail: { message: message }
      })
    );
  }

  function setLive(region, message) {
    if (!region) {
      return;
    }

    region.textContent = '';
    global.setTimeout(function () {
      region.textContent = message;
    }, 20);
  }

  function summaryText(result) {
    var config = configFor(result);
    var lines = [
      titleFor(result),
      '',
      result.summary.text,
      '',
      'Key concepts'
    ];

    result.summary.keyConcepts.forEach(function (point, index) {
      lines.push(index + 1 + '. ' + point);
    });

    lines.push('');
    lines.push(
      'MindForge · ' +
        config.answerStyleLabel +
        ' · ' +
        config.difficultyLabel +
        ' difficulty'
    );
    lines.push('Generated locally in the browser. No AI service was used.');

    return lines.join('\n');
  }

  function slugify(value) {
    var slug = String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    return slug || 'study-summary';
  }

  function setSummaryStatus(message, state) {
    if (!summaryStatus) {
      return;
    }

    summaryStatus.textContent = message;
    summaryStatus.hidden = !message;
    summaryStatus.className =
      'summary-status' + (state ? ' summary-status--' + state : '');
  }

  function copyFallback(text) {
    var field = document.createElement('textarea');

    field.value = text;
    field.setAttribute('readonly', '');
    field.setAttribute('aria-hidden', 'true');
    field.style.position = 'fixed';
    field.style.top = '-1000px';
    field.style.opacity = '0';
    document.body.appendChild(field);

    var copied = false;
    try {
      field.select();
      field.setSelectionRange(0, field.value.length);
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }

    document.body.removeChild(field);
    return copied;
  }

  function copyLabelElement() {
    return summaryCopy
      ? summaryCopy.querySelector('[data-copy-label]')
      : null;
  }

  function copySucceeded() {
    setSummaryStatus('Summary copied to the clipboard.', 'success');
    notify('Summary copied to the clipboard.');

    var label = copyLabelElement();

    if (label) {
      label.textContent = 'Copied';
      global.clearTimeout(copyTimer);
      copyTimer = global.setTimeout(function () {
        label.textContent = 'Copy';
      }, 2400);
    }
  }

  function copyFailed() {
    setSummaryStatus(
      'Copy did not work in this browser. Select the summary text and copy it manually.',
      'error'
    );
    notify('Copy is unavailable in this browser.');
  }

  function handleCopy() {
    if (!current) {
      return;
    }

    var text = summaryText(current.result);

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(copySucceeded, function () {
        if (copyFallback(text)) {
          copySucceeded();
        } else {
          copyFailed();
        }
      });
      return;
    }

    if (copyFallback(text)) {
      copySucceeded();
    } else {
      copyFailed();
    }
  }

  function handleDownload() {
    if (!current) {
      return;
    }

    var text = summaryText(current.result);
    var filename = 'mindforge-' + slugify(titleFor(current.result)) + '.txt';

    try {
      if (typeof global.Blob !== 'function' || !global.URL || !global.URL.createObjectURL) {
        throw new Error('Downloads are unavailable.');
      }

      var blob = new global.Blob([text], { type: 'text/plain;charset=utf-8' });
      var url = global.URL.createObjectURL(blob);
      var link = document.createElement('a');

      link.href = url;
      link.download = filename;
      link.rel = 'noopener';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      global.setTimeout(function () {
        global.URL.revokeObjectURL(url);
      }, 1500);

      setSummaryStatus('Summary downloaded as ' + filename + '.', 'success');
      notify('Summary download started.');
    } catch (error) {
      setSummaryStatus('Download is unavailable in this browser.', 'error');
      notify('Download is unavailable in this browser.');
    }
  }

  function renderSummary(result) {
    var config = configFor(result);
    var minutes = minutesFor(result);

    if (titleElement) {
      titleElement.textContent = titleFor(result);
    }

    if (metaElement) {
      var meta = [
        config.answerStyleLabel,
        config.difficultyLabel + ' difficulty',
        result.quiz.length + ' questions',
        result.flashcards.length + ' flashcards'
      ];

      if (minutes) {
        meta.push('about ' + minutes + ' min');
      }

      metaElement.textContent = meta.join(' · ');
    }

    if (summaryOverview) {
      summaryOverview.textContent = result.summary.text;
    }

    if (summaryPoints) {
      summaryPoints.textContent = '';

      result.summary.keyConcepts.forEach(function (point) {
        var item = document.createElement('li');
        var text = document.createElement('span');

        item.appendChild(createIcon('check'));
        text.textContent = point;
        item.appendChild(text);
        summaryPoints.appendChild(item);
      });
    }

    if (summaryTime) {
      summaryTime.textContent = minutes ? '~' + minutes + ' min' : '—';
    }

    var copyLabel = copyLabelElement();

    if (copyLabel) {
      copyLabel.textContent = 'Copy';
    }

    setSummaryStatus('');

    var summaryCount = resultSection.querySelector('[data-tab-count="summary"]');
    if (summaryCount) {
      summaryCount.textContent = result.summary.keyConcepts.length + ' points';
    }
  }

  function scoreState() {
    if (!current) {
      return { answered: 0, correct: 0, total: 0, percent: 0, complete: false };
    }

    var questions = current.result.quiz;
    var answered = 0;
    var correct = 0;

    questions.forEach(function (question) {
      if (!Object.prototype.hasOwnProperty.call(quizAnswers, question.id)) {
        return;
      }

      answered += 1;

      if (quizAnswers[question.id] === question.correctAnswer) {
        correct += 1;
      }
    });

    return {
      answered: answered,
      correct: correct,
      total: questions.length,
      percent: questions.length ? Math.round((correct / questions.length) * 100) : 0,
      complete: answered === questions.length
    };
  }

  function updateQuizSummary() {
    var state = scoreState();

    if (quizProgress) {
      quizProgress.textContent = state.answered + ' of ' + state.total + ' answered';
    }

    if (quizScore) {
      quizScore.textContent = state.correct + ' / ' + state.total;
    }

    if (quizComplete) {
      quizComplete.hidden = !state.complete;
    }

    if (state.complete) {
      if (quizCompleteScore) {
        quizCompleteScore.textContent = state.correct + ' / ' + state.total;
      }

      if (quizCompletePercent) {
        quizCompletePercent.textContent = state.percent + '%';
      }
    }

    return state;
  }

  function applyAnswerState(questionElement, question, selected) {
    var isCorrect = selected === question.correctAnswer;
    var inputs = Array.prototype.slice.call(
      questionElement.querySelectorAll('input[type="radio"]')
    );
    var feedback = questionElement.querySelector('[data-quiz-feedback]');
    var feedbackResult = questionElement.querySelector('[data-feedback-result]');
    var feedbackAnswer = questionElement.querySelector('[data-feedback-answer]');
    var feedbackExplain = questionElement.querySelector('[data-feedback-explanation]');

    questionElement.classList.add('is-answered');
    questionElement.classList.toggle('is-correct', isCorrect);
    questionElement.classList.toggle('is-incorrect', !isCorrect);

    inputs.forEach(function (input) {
      var option = input.closest('.quiz-option');
      var optionIndex = Number(input.value);

      input.disabled = true;
      input.checked = optionIndex === selected;

      if (!option) {
        return;
      }

      option.classList.toggle(
        'is-correct',
        optionIndex === question.correctAnswer
      );
      option.classList.toggle(
        'is-selected',
        optionIndex === selected
      );
      option.classList.toggle(
        'is-wrong',
        optionIndex === selected && !isCorrect
      );
    });

    if (feedback) {
      feedback.hidden = false;
    }

    if (feedbackResult) {
      feedbackResult.textContent = isCorrect ? 'Correct' : 'Not quite';
    }

    if (feedbackAnswer) {
      feedbackAnswer.textContent =
        'Correct answer: ' + question.options[question.correctAnswer];
    }

    if (feedbackExplain) {
      feedbackExplain.textContent = question.explanation;
    }
  }

  function persistProgress() {
    if (!current) {
      return;
    }

    var progress = {
      quiz: { answers: quizAnswers },
      flashcards: { known: Object.keys(knownCards) }
    };

    current.result.progress = progress;

    if (history) {
      history.updateProgress(current.result.id, progress);
    }
  }

  function answerQuestion(questionElement, question, selected) {
    if (Object.prototype.hasOwnProperty.call(quizAnswers, question.id)) {
      return;
    }

    quizAnswers[question.id] = selected;
    applyAnswerState(questionElement, question, selected);
    var state = updateQuizSummary();
    persistProgress();

    var isCorrect = selected === question.correctAnswer;
    setLive(
      quizLive,
      isCorrect
        ? 'Correct. ' + question.options[question.correctAnswer] + '.'
        : 'Not quite. The correct answer is ' +
            question.options[question.correctAnswer] +
            '. ' +
            question.explanation
    );

    if (state.complete) {
      setLive(
        quizLive,
        'Quiz complete. You scored ' +
          state.correct +
          ' out of ' +
          state.total +
          ', ' +
          state.percent +
          ' percent.'
      );
    }
  }

  function createQuestion(question, index) {
    var item = document.createElement('li');
    item.className = 'quiz-question';
    item.setAttribute('data-question-id', question.id);

    var fieldset = document.createElement('fieldset');
    fieldset.className = 'quiz-question__fieldset';

    var legend = document.createElement('legend');
    legend.className = 'quiz-question__prompt';

    var number = document.createElement('span');
    number.className = 'quiz-question__number';
    number.setAttribute('aria-hidden', 'true');
    number.textContent = padTwo(index + 1);

    var prompt = document.createElement('span');
    prompt.className = 'quiz-question__text';
    prompt.textContent = question.question;

    legend.appendChild(number);
    legend.appendChild(prompt);
    fieldset.appendChild(legend);

    var options = document.createElement('div');
    options.className = 'quiz-options';
    var groupName = 'mindforge-' + current.result.id + '-' + question.id;

    question.options.forEach(function (optionText, optionIndex) {
      var label = document.createElement('label');
      label.className = 'quiz-option';

      var input = document.createElement('input');
      input.className = 'sr-only';
      input.type = 'radio';
      input.name = groupName;
      input.value = String(optionIndex);

      var body = document.createElement('span');
      body.className = 'quiz-option__body';

      var letter = document.createElement('span');
      letter.className = 'quiz-option__letter';
      letter.setAttribute('aria-hidden', 'true');
      letter.textContent = String.fromCharCode(65 + optionIndex);

      var text = document.createElement('span');
      text.className = 'quiz-option__text';
      text.textContent = optionText;

      var marker = document.createElement('span');
      marker.className = 'quiz-option__marker';
      marker.setAttribute('aria-hidden', 'true');
      marker.appendChild(createIcon('check', 'icon--small'));

      body.appendChild(letter);
      body.appendChild(text);
      body.appendChild(marker);
      label.appendChild(input);
      label.appendChild(body);
      options.appendChild(label);

      input.addEventListener('change', function () {
        if (!input.checked) {
          return;
        }

        answerQuestion(item, question, optionIndex);
      });
    });

    fieldset.appendChild(options);
    item.appendChild(fieldset);

    var feedback = document.createElement('div');
    feedback.className = 'quiz-feedback';
    feedback.setAttribute('data-quiz-feedback', '');
    feedback.hidden = true;

    var feedbackResult = document.createElement('strong');
    feedbackResult.className = 'quiz-feedback__result';
    feedbackResult.setAttribute('data-feedback-result', '');

    var feedbackAnswer = document.createElement('p');
    feedbackAnswer.className = 'quiz-feedback__answer';
    feedbackAnswer.setAttribute('data-feedback-answer', '');

    var feedbackExplain = document.createElement('p');
    feedbackExplain.className = 'quiz-feedback__explanation';
    feedbackExplain.setAttribute('data-feedback-explanation', '');

    feedback.appendChild(feedbackResult);
    feedback.appendChild(feedbackAnswer);
    feedback.appendChild(feedbackExplain);
    item.appendChild(feedback);

    if (Object.prototype.hasOwnProperty.call(quizAnswers, question.id)) {
      applyAnswerState(item, question, quizAnswers[question.id]);
    }

    return item;
  }

  function renderQuiz(result) {
    if (quizDifficulty) {
      quizDifficulty.textContent = configFor(result).difficultyLabel;
    }

    if (quizList) {
      quizList.textContent = '';

      result.quiz.forEach(function (question, index) {
        quizList.appendChild(createQuestion(question, index));
      });
    }

    updateQuizSummary();

    var quizCount = resultSection.querySelector('[data-tab-count="quiz"]');
    if (quizCount) {
      quizCount.textContent = result.quiz.length + ' questions';
    }
  }

  function updateMasterySummary() {
    var known = Object.keys(knownCards).length;
    var total = current ? current.result.flashcards.length : 0;

    if (masteredCount) {
      masteredCount.textContent = known + ' of ' + total + ' known';
    }

    var cardTabCount = resultSection.querySelector('[data-tab-count="flashcards"]');
    if (cardTabCount) {
      cardTabCount.textContent = known + ' / ' + total + ' known';
    }
  }

  function setCardMastery(cardId, value) {
    var card = flashcardList && flashcardList.querySelector('[data-card-id="' + cardId + '"]');

    if (!card) {
      return;
    }

    if (value) {
      knownCards[cardId] = true;
    } else {
      delete knownCards[cardId];
    }

    card.classList.toggle('is-known', value);
    card.classList.toggle('is-unknown', !value);

    var knownButton = card.querySelector('[data-mastery="known"]');
    var unknownButton = card.querySelector('[data-mastery="unknown"]');

    if (knownButton) {
      knownButton.setAttribute('aria-pressed', value ? 'true' : 'false');
    }

    if (unknownButton) {
      unknownButton.setAttribute('aria-pressed', value ? 'false' : 'true');
    }

    updateMasterySummary();
    persistProgress();

    var index = current.result.flashcards.length;
    current.result.flashcards.forEach(function (item, itemIndex) {
      if (item.id === cardId) {
        index = itemIndex + 1;
      }
    });
    var known = Object.keys(knownCards).length;
    setLive(
      flashcardLive,
      'Card ' +
        index +
        (value ? ' marked as known. ' : ' marked as not known. ') +
        known +
        ' of ' +
        current.result.flashcards.length +
        ' known.'
    );
  }

  function toggleCard(card, toggle, front, back, index) {
    var flipped = card.classList.toggle('is-flipped');

    toggle.setAttribute('aria-expanded', flipped ? 'true' : 'false');
    toggle.setAttribute(
      'aria-label',
      (flipped ? 'Show question for card ' : 'Show answer for card ') +
        (index + 1)
    );
    front.setAttribute('aria-hidden', flipped ? 'true' : 'false');
    back.setAttribute('aria-hidden', flipped ? 'false' : 'true');
  }

  function createFlashcard(card, index) {
    var item = document.createElement('li');
    item.className = 'flashcard';
    item.setAttribute('data-card-id', card.id);

    if (knownCards[card.id]) {
      item.classList.add('is-known');
    }

    var toggle = document.createElement('button');
    toggle.className = 'flashcard__toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'Show answer for card ' + (index + 1));

    var inner = document.createElement('span');
    inner.className = 'flashcard__inner';

    var front = document.createElement('span');
    front.className = 'flashcard__face flashcard__face--front';

    var frontHead = document.createElement('span');
    frontHead.className = 'flashcard__face-head';
    var frontIndex = document.createElement('span');
    frontIndex.className = 'flashcard__index';
    frontIndex.textContent = padTwo(index + 1);
    var frontLabel = document.createElement('span');
    frontLabel.className = 'flashcard__label';
    frontLabel.textContent = 'Question';
    frontHead.appendChild(frontIndex);
    frontHead.appendChild(frontLabel);

    var frontText = document.createElement('span');
    frontText.className = 'flashcard__text';
    frontText.textContent = card.front;

    var frontHint = document.createElement('span');
    frontHint.className = 'flashcard__hint';
    frontHint.textContent = 'Tap to reveal answer';

    front.appendChild(frontHead);
    front.appendChild(frontText);
    front.appendChild(frontHint);

    var back = document.createElement('span');
    back.className = 'flashcard__face flashcard__face--back';
    back.setAttribute('aria-hidden', 'true');

    var backHead = document.createElement('span');
    backHead.className = 'flashcard__face-head';
    var backIndex = document.createElement('span');
    backIndex.className = 'flashcard__index';
    backIndex.textContent = padTwo(index + 1);
    var backLabel = document.createElement('span');
    backLabel.className = 'flashcard__label flashcard__label--answer';
    backLabel.textContent = 'Answer';
    backHead.appendChild(backIndex);
    backHead.appendChild(backLabel);

    var backText = document.createElement('span');
    backText.className = 'flashcard__text';
    backText.textContent = card.back;

    var backHint = document.createElement('span');
    backHint.className = 'flashcard__hint';
    backHint.textContent = 'Tap to return to the question';

    back.appendChild(backHead);
    back.appendChild(backText);
    back.appendChild(backHint);

    inner.appendChild(front);
    inner.appendChild(back);
    toggle.appendChild(inner);

    toggle.addEventListener('click', function () {
      toggleCard(item, toggle, front, back, index);
    });

    var controls = document.createElement('div');
    controls.className = 'flashcard__controls';

    var knownButton = document.createElement('button');
    knownButton.className = 'btn btn--quiet btn--sm';
    knownButton.type = 'button';
    knownButton.setAttribute('data-mastery', 'known');
    knownButton.setAttribute('aria-pressed', 'false');
    knownButton.setAttribute('aria-label', 'Mark card ' + (index + 1) + ' as known');
    knownButton.textContent = 'Known';

    var unknownButton = document.createElement('button');
    unknownButton.className = 'btn btn--quiet btn--sm';
    unknownButton.type = 'button';
    unknownButton.setAttribute('data-mastery', 'unknown');
    unknownButton.setAttribute('aria-pressed', 'false');
    unknownButton.setAttribute(
      'aria-label',
      'Mark card ' + (index + 1) + ' as not known'
    );
    unknownButton.textContent = 'Not known';

    if (knownCards[card.id]) {
      knownButton.setAttribute('aria-pressed', 'true');
      unknownButton.setAttribute('aria-pressed', 'false');
    }

    knownButton.addEventListener('click', function () {
      setCardMastery(card.id, true);
    });

    unknownButton.addEventListener('click', function () {
      setCardMastery(card.id, false);
    });

    controls.appendChild(knownButton);
    controls.appendChild(unknownButton);
    item.appendChild(toggle);
    item.appendChild(controls);

    return item;
  }

  function renderFlashcards(result) {
    if (cardCount) {
      cardCount.textContent = result.flashcards.length + ' cards';
    }

    if (flashcardList) {
      flashcardList.textContent = '';

      result.flashcards.forEach(function (card, index) {
        flashcardList.appendChild(createFlashcard(card, index));
      });
    }

    updateMasterySummary();
  }

  function activateTab(name, shouldFocus) {
    activeTab = name;

    tabButtons.forEach(function (button) {
      var selected = button.getAttribute('data-result-tab') === name;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.setAttribute('tabindex', selected ? '0' : '-1');

      if (selected && shouldFocus) {
        button.focus();
      }
    });

    panels.forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-result-panel') !== name;
    });
  }

  function bindTabs() {
    tabButtons.forEach(function (button, index) {
      button.addEventListener('click', function () {
        activateTab(button.getAttribute('data-result-tab'), false);
      });

      button.addEventListener('keydown', function (event) {
        var nextIndex = null;

        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          nextIndex = (index + 1) % tabButtons.length;
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          nextIndex = (index - 1 + tabButtons.length) % tabButtons.length;
        } else if (event.key === 'Home') {
          nextIndex = 0;
        } else if (event.key === 'End') {
          nextIndex = tabButtons.length - 1;
        }

        if (nextIndex === null) {
          return;
        }

        event.preventDefault();
        activateTab(
          tabButtons[nextIndex].getAttribute('data-result-tab'),
          true
        );
      });
    });
  }

  function setSavedState(value) {
    if (!saveState) {
      return;
    }

    saveState.textContent = value ? 'Saved locally' : 'Not in History';
    saveState.parentElement.classList.toggle('is-unsaved', !value);
  }

  function hydrateProgress(result) {
    var progress = result.progress;
    var record = history ? history.get(result.id) : null;

    if (record && record.progress) {
      progress = record.progress;
    }

    if (!progress) {
      return;
    }

    if (progress.quiz && progress.quiz.answers) {
      Object.keys(progress.quiz.answers).forEach(function (id) {
        quizAnswers[id] = progress.quiz.answers[id];
      });
    }

    if (progress.flashcards && Array.isArray(progress.flashcards.known)) {
      progress.flashcards.known.forEach(function (id) {
        knownCards[id] = true;
      });
    }
  }

  function render(result, options) {
    var settings = options || {};

    current = { result: result };
    quizAnswers = Object.create(null);
    knownCards = Object.create(null);
    hydrateProgress(result);

    renderSummary(result);
    renderQuiz(result);
    renderFlashcards(result);
    activateTab('summary', false);

    var isSaved =
      typeof settings.saved === 'boolean'
        ? settings.saved
        : Boolean(history && history.get(result.id));
    setSavedState(isSaved);

    resultSection.hidden = false;
    return current;
  }

  function open(result) {
    return render(result, {
      saved: Boolean(history && history.get(result.id))
    });
  }

  function reveal() {
    if (!resultSection || !resultSection.scrollIntoView) {
      return;
    }

    var behavior = reducedMotion && reducedMotion.matches ? 'auto' : 'smooth';
    resultSection.scrollIntoView({ behavior: behavior, block: 'start' });
  }

  function restartQuiz() {
    if (!current) {
      return;
    }

    quizAnswers = Object.create(null);
    persistProgress();
    renderQuiz(current.result);
    setLive(quizLive, 'Quiz restarted. All questions are ready to answer again.');

    var firstInput = quizList && quizList.querySelector('input[type="radio"]');
    if (firstInput) {
      try {
        firstInput.focus({ preventScroll: true });
      } catch (error) {
        firstInput.focus();
      }
    }
  }

  function syncSavedState() {
    if (!current) {
      return;
    }

    setSavedState(Boolean(history && history.get(current.result.id)));
  }

  function init() {
    if (summaryCopy) {
      summaryCopy.addEventListener('click', handleCopy);
    }

    if (summaryDownload) {
      summaryDownload.addEventListener('click', handleDownload);
    }

    if (quizRestart) {
      quizRestart.addEventListener('click', restartQuiz);
    }

    bindTabs();

    document.addEventListener('mindforge:historychange', syncSavedState);

    if (!stored) {
      setSavedState(false);
    }
  }

  global.MindForgeLearning = Object.freeze({
    render: render,
    open: open,
    reveal: reveal,
    syncSavedState: syncSavedState,
    getState: function () {
      return {
        resultId: current ? current.result.id : null,
        tab: activeTab,
        answers: Object.assign({}, quizAnswers),
        known: Object.keys(knownCards),
        score: scoreState()
      };
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
