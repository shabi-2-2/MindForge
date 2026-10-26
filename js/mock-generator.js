/**
 * MindForge local mock generator
 * Shapes a topic and a set of notes into a study summary, a retrieval quiz and
 * a flashcard deck entirely in the browser. The Promise and short delay exist
 * only to model an asynchronous generator for the workspace UI; no network
 * request, backend or AI service is involved.
 */
(function (global) {
  'use strict';

  var DEFAULT_DELAY = 1400;
  var MAX_TOPIC = 120;
  var MAX_NOTES = 5000;
  var MAX_POINT_LENGTH = 190;

  var STYLE_LABELS = {
    kid: "Explain Like I'm 10",
    exam: 'Exam-Focused',
    detailed: 'Detailed'
  };

  var STYLE_PROFILES = {
    kid: {
      keyPoints: 3,
      minutes: 18,
      overview: function (topic) {
        return (
          'Here is ' +
          topic +
          ' in plain language: start with the big idea, add one concrete example, ' +
          'and keep the explanation simple enough to say out loud.'
        );
      }
    },
    exam: {
      keyPoints: 4,
      minutes: 24,
      overview: function (topic) {
        return (
          'A focused pass over ' +
          topic +
          ': the central idea, the supporting details most worth testing, and a short ' +
          'retrieval check to expose gaps before exam day.'
        );
      }
    },
    detailed: {
      keyPoints: 5,
      minutes: 30,
      overview: function (topic) {
        return (
          'A layered pass over ' +
          topic +
          ': define the central idea, connect the supporting details, and keep the nuance ' +
          'visible as you move from notes to recall.'
        );
      }
    }
  };

  var DIFFICULTIES = {
    easy: { label: 'Easy', questions: 5, cards: 4, minutes: 0 },
    medium: { label: 'Medium', questions: 5, cards: 5, minutes: 2 },
    hard: { label: 'Hard', questions: 5, cards: 6, minutes: 4 }
  };

  var SMALL_WORDS = {
    a: true,
    an: true,
    and: true,
    as: true,
    at: true,
    but: true,
    by: true,
    for: true,
    from: true,
    in: true,
    into: true,
    nor: true,
    of: true,
    on: true,
    or: true,
    over: true,
    per: true,
    the: true,
    to: true,
    up: true,
    via: true,
    vs: true,
    with: true
  };

  var STOP_WORDS = {
    about: true,
    after: true,
    again: true,
    against: true,
    almost: true,
    along: true,
    also: true,
    although: true,
    always: true,
    among: true,
    another: true,
    around: true,
    because: true,
    before: true,
    being: true,
    between: true,
    both: true,
    cannot: true,
    could: true,
    every: true,
    everything: true,
    first: true,
    found: true,
    from: true,
    further: true,
    have: true,
    having: true,
    however: true,
    into: true,
    itself: true,
    might: true,
    more: true,
    most: true,
    much: true,
    must: true,
    other: true,
    over: true,
    should: true,
    since: true,
    some: true,
    such: true,
    than: true,
    that: true,
    their: true,
    them: true,
    then: true,
    there: true,
    these: true,
    they: true,
    this: true,
    those: true,
    through: true,
    under: true,
    until: true,
    very: true,
    what: true,
    when: true,
    where: true,
    which: true,
    while: true,
    with: true,
    within: true,
    without: true,
    would: true,
    your: true
  };

  var QUESTION_BUILDERS = [
    function (topic, insight) {
      return {
        prompt: 'Which detail comes directly from your notes on ' + topic + '?',
        correctAnswer: insight,
        wrongAnswers: [
          'A single read-through is enough to remember the material.',
          'Memorising isolated terms is a substitute for understanding connections.',
          'Self-testing should wait until everything feels fully confident.'
        ],
        explanation:
          'This sentence comes from the notes you supplied. The other options are study myths, not details about ' +
          topic +
          '.'
      };
    },
    function (topic, insight) {
      return {
        prompt: 'Which point would make the most useful flashcard for ' + topic + '?',
        correctAnswer: insight,
        wrongAnswers: [
          'A vague summary that leaves out the supporting detail.',
          'A list of terms with no definitions or examples.',
          'A fact that belongs to a different topic entirely.'
        ],
        explanation:
          'The selected point is specific and comes from your notes, which makes it a stronger prompt than a vague or unrelated statement.'
      };
    },
    function (topic) {
      return {
        prompt: 'Which review method best strengthens recall of ' + topic + '?',
        correctAnswer:
          'Close the notes and explain it from memory, then check what you missed.',
        wrongAnswers: [
          'Read the notes repeatedly without testing yourself.',
          'Highlight every sentence and hope it sticks.',
          'Wait until the night before the exam to review.'
        ],
        explanation:
          'Retrieval practice — recalling without looking — exposes gaps while there is still time to correct them.'
      };
    },
    function (topic) {
      return {
        prompt: 'How should you handle a detail about ' + topic + ' that keeps slipping away?',
        correctAnswer: 'Retrieve it in short, spaced reviews and correct the gap each time.',
        wrongAnswers: [
          'Skip it and focus only on what already feels easy.',
          'Reread the whole set of notes in one long session.',
          'Copy the detail out repeatedly without trying to recall it.'
        ],
        explanation:
          'Spacing and retrieval are more durable than rereading or copying, especially for a detail that keeps disappearing.'
      };
    },
    function (topic) {
      return {
        prompt: 'Which sign suggests you understand ' + topic + ' well enough to move on?',
        correctAnswer:
          'You can explain the main idea and give an example without looking at your notes.',
        wrongAnswers: [
          'You recognise the words but cannot explain how the ideas connect.',
          'You can repeat the notes word for word.',
          'You feel confident without ever testing your recall.'
        ],
        explanation:
          'Understanding shows up as explanation and application, not familiarity or confidence alone.'
      };
    }
  ];

  function normaliseSpace(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function clip(value, maxLength) {
    if (value.length <= maxLength) {
      return value;
    }

    var clipped = value.slice(0, maxLength - 1);
    var lastSpace = clipped.lastIndexOf(' ');

    if (lastSpace > maxLength * 0.6) {
      clipped = clipped.slice(0, lastSpace);
    }

    return clipped.replace(/[\s,;:.-]+$/, '') + '…';
  }

  function cleanFragment(value) {
    var text = String(value)
      .replace(/^[\s>*•·-]+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!text) {
      return '';
    }

    text = text.charAt(0).toUpperCase() + text.slice(1);
    text = clip(text, MAX_POINT_LENGTH);

    if (!/[.!?…]$/.test(text)) {
      text += '.';
    }

    return text;
  }

  function extractFragments(notes) {
    var fragments = [];

    notes.split(/\n+/).forEach(function (line) {
      var normalised = line.replace(/\s+/g, ' ').trim();

      if (!normalised) {
        return;
      }

      normalised.split(/;\s+/).forEach(function (part) {
        var matches = part.match(/[^.!?]+[.!?]*/g) || [];

        matches.forEach(function (fragment) {
          var cleaned = cleanFragment(fragment);

          if (cleaned.length >= 24) {
            fragments.push(cleaned);
          }
        });
      });
    });

    if (!fragments.length) {
      var fallback = cleanFragment(notes);

      if (fallback) {
        fragments.push(fallback);
      }
    }

    return fragments;
  }

  function buildInsights(topic, notes) {
    var insights = [];
    var seen = Object.create(null);

    extractFragments(notes).forEach(function (fragment) {
      var key = fragment.toLowerCase();

      if (!seen[key]) {
        seen[key] = true;
        insights.push(fragment);
      }
    });

    var fallbacks = [
      'Define ' + topic + ' in one or two sentences before adding detail.',
      'Connect the main terms in ' + topic + ' to an example or consequence.',
      'Check recall of ' + topic + ' with short, closed-book questions.',
      'Explain ' + topic + ' aloud and notice where the explanation breaks down.',
      'Revisit ' + topic + ' in spaced reviews rather than one long block.',
      'Test ' + topic + ' from several angles: definition, example and application.'
    ];

    for (var index = 0; index < fallbacks.length && insights.length < 6; index += 1) {
      var point = fallbacks[index];
      var pointKey = point.toLowerCase();

      if (!seen[pointKey]) {
        seen[pointKey] = true;
        insights.push(point);
      }
    }

    return insights.slice(0, 6);
  }

  function topicTitle(topic) {
    return topic
      .split(/\s+/)
      .map(function (word, index) {
        if (/^[A-Z0-9][A-Z0-9-]+$/.test(word)) {
          return word;
        }

        var lower = word.toLowerCase();

        if (index > 0 && SMALL_WORDS[lower]) {
          return lower;
        }

        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(' ');
  }

  function buildSummary(topic, notes, styleKey, difficultyKey, insights) {
    var style = STYLE_PROFILES[styleKey];
    var difficulty = DIFFICULTIES[difficultyKey];
    var estimatedMinutes = style.minutes + difficulty.minutes;

    if (notes.length > 900) {
      estimatedMinutes += 3;
    }

    if (notes.length > 2200) {
      estimatedMinutes += 3;
    }

    return {
      title: topicTitle(topic),
      overview: style.overview(topic),
      keyPoints: insights.slice(0, style.keyPoints),
      estimatedMinutes: Math.max(12, Math.min(60, estimatedMinutes))
    };
  }

  function buildQuestions(topic, insights, difficultyKey) {
    var count = DIFFICULTIES[difficultyKey].questions;
    var questions = [];

    for (var index = 0; index < count; index += 1) {
      var builder = QUESTION_BUILDERS[index % QUESTION_BUILDERS.length];
      var insight = insights[index % insights.length];
      var content = builder(topic, insight);
      var correctIndex = index % 4;
      var wrongIndex = 0;
      var options = [];

      for (var slot = 0; slot < 4; slot += 1) {
        if (slot === correctIndex) {
          options.push(content.correctAnswer);
        } else {
          options.push(content.wrongAnswers[wrongIndex]);
          wrongIndex += 1;
        }
      }

      questions.push({
        id: 'q' + (index + 1),
        prompt: content.prompt,
        options: options,
        answerIndex: correctIndex,
        explanation: content.explanation
      });
    }

    return questions;
  }

  function makeCloze(sentence) {
    var words = sentence.split(' ');
    var bestIndex = -1;
    var bestLength = 0;
    var bestAnswer = '';

    for (var index = 0; index < words.length; index += 1) {
      var cleaned = words[index].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');

      if (
        cleaned.length >= 5 &&
        cleaned.length > bestLength &&
        !STOP_WORDS[cleaned.toLowerCase()]
      ) {
        bestIndex = index;
        bestLength = cleaned.length;
        bestAnswer = cleaned;
      }
    }

    if (bestIndex === -1) {
      return null;
    }

    var masked = words.slice();
    masked[bestIndex] = '_____';

    return {
      front: 'Fill the gap: “' + masked.join(' ') + '”',
      back: bestAnswer + ' — ' + sentence
    };
  }

  function buildFlashcards(topic, overview, insights, difficultyKey) {
    var count = DIFFICULTIES[difficultyKey].cards;
    var cards = [
      {
        id: 'fc1',
        front: 'What is the central idea of ' + topic + '?',
        back: overview
      }
    ];

    for (var index = 1; index < count; index += 1) {
      var insight = insights[(index - 1) % insights.length];
      var cloze = makeCloze(insight);

      cards.push({
        id: 'fc' + (index + 1),
        front: cloze ? cloze.front : 'Recall this point about ' + topic + '.',
        back: cloze ? cloze.back : insight
      });
    }

    return cards;
  }

  function buildResult(topic, notes, styleKey, difficultyKey) {
    var insights = buildInsights(topic, notes);
    var summary = buildSummary(topic, notes, styleKey, difficultyKey, insights);

    return {
      id:
        'study-' +
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2, 7),
      createdAt: new Date().toISOString(),
      topic: topic,
      notes: notes,
      config: {
        answerStyle: styleKey,
        answerStyleLabel: STYLE_LABELS[styleKey],
        difficulty: difficultyKey,
        difficultyLabel: DIFFICULTIES[difficultyKey].label
      },
      summary: summary,
      quiz: {
        difficulty: difficultyKey,
        difficultyLabel: DIFFICULTIES[difficultyKey].label,
        questions: buildQuestions(topic, insights, difficultyKey)
      },
      flashcards: buildFlashcards(topic, summary.overview, insights, difficultyKey),
      meta: {
        generator: 'local-mock',
        version: 2,
        characters: {
          topic: topic.length,
          notes: notes.length
        }
      }
    };
  }

  function generate(input, options) {
    var payload = input || {};
    var topic = normaliseSpace(payload.topic).slice(0, MAX_TOPIC);
    var notes = String(payload.notes == null ? '' : payload.notes)
      .replace(/\r\n?/g, '\n')
      .trim()
      .slice(0, MAX_NOTES);

    if (!topic || !notes) {
      return Promise.reject(
        new Error('A topic and notes are required to generate study material.')
      );
    }

    var styleKey = STYLE_PROFILES[payload.answerStyle] ? payload.answerStyle : 'exam';
    var difficultyKey = DIFFICULTIES[payload.difficulty] ? payload.difficulty : 'medium';
    var delay =
      options && typeof options.delay === 'number'
        ? Math.max(0, options.delay)
        : DEFAULT_DELAY;

    return new Promise(function (resolve, reject) {
      global.setTimeout(function () {
        try {
          resolve(buildResult(topic, notes, styleKey, difficultyKey));
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  }

  global.MindForgeGenerator = Object.freeze({
    generate: generate,
    DEFAULT_DELAY: DEFAULT_DELAY,
    MAX_TOPIC: MAX_TOPIC,
    MAX_NOTES: MAX_NOTES
  });
})(window);
