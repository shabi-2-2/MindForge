import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = 'mindforge:';

function createStore(initial) {
  return new Map(Object.entries(initial || {}));
}

function createEnvironment(store, options) {
  const settings = options || {};
  const events = [];
  const windowListeners = Object.create(null);

  const localStorage = {
    getItem(key) {
      if (settings.blocked) {
        throw new Error('Storage is blocked');
      }

      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (settings.blocked) {
        throw new Error('Storage is blocked');
      }

      if (settings.quota && key !== PREFIX + '__probe__') {
        const error = new Error('Quota exceeded');
        error.name = 'QuotaExceededError';
        throw error;
      }

      store.set(key, String(value));
    },
    removeItem(key) {
      if (settings.blocked) {
        throw new Error('Storage is blocked');
      }

      store.delete(key);
    }
  };

  const documentListeners = Object.create(null);
  const document = {
    dispatchEvent(event) {
      events.push(event);
      (documentListeners[event.type] || []).forEach((listener) => listener(event));
      return true;
    },
    addEventListener(type, listener) {
      documentListeners[type] = documentListeners[type] || [];
      documentListeners[type].push(listener);
    }
  };

  class FakeCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  }

  const context = {
    Array,
    Boolean,
    Date,
    Error,
    JSON,
    Math,
    Number,
    Object,
    Promise,
    String,
    TypeError,
    clearTimeout,
    console,
    document,
    isFinite,
    localStorage,
    setTimeout
  };

  context.window = context;
  context.globalThis = context;
  context.CustomEvent = FakeCustomEvent;
  context.addEventListener = function (type, listener) {
    windowListeners[type] = windowListeners[type] || [];
    windowListeners[type].push(listener);
  };

  vm.createContext(context);

  ['js/storage.js', 'js/study-contract.js', 'js/analytics.js', 'js/history.js'].forEach(
    (file) => {
      vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {
        filename: file
      });
    }
  );

  return {
    analytics: context.MindForgeAnalytics,
    context,
    document,
    events,
    history: context.MindForgeHistory,
    store
  };
}

function makeQuiz() {
  return Array.from({ length: 5 }, (_, index) => ({
    id: 'q' + (index + 1),
    question: 'Question ' + (index + 1) + ' about the topic?',
    options: ['Option A', 'Option B', 'Option C', 'Option D'],
    correctAnswer: index % 4,
    explanation: 'Explanation for question ' + (index + 1) + '.'
  }));
}

function makeResult(overrides) {
  const base = {
    id: 'study-test-1',
    createdAt: '2026-10-20T10:00:00.000Z',
    topic: 'The adaptive immune system',
    notes:
      'The adaptive immune system remembers pathogens it has met before. ' +
      'Antibodies bind specific antigens and mark them for destruction.',
    config: {
      answerStyle: 'exam',
      answerStyleLabel: 'Exam-Focused',
      difficulty: 'medium',
      difficultyLabel: 'Medium'
    },
    summary: {
      title: 'Adaptive immunity',
      text: 'A focused overview of how adaptive immunity recognises and remembers pathogens.',
      keyConcepts: ['Memory', 'Specificity', 'Antibodies'],
      estimatedMinutes: 24
    },
    quiz: makeQuiz(),
    flashcards: [
      { id: 'fc1', front: 'What is immunological memory?', back: 'A faster response to a known pathogen.' },
      { id: 'fc2', front: 'What do antibodies bind?', back: 'Specific antigens.' }
    ],
    meta: { generator: 'test', version: 1 }
  };

  return JSON.parse(JSON.stringify(Object.assign(base, overrides || {})));
}

function readEnvelope(store) {
  return JSON.parse(store.get(PREFIX + 'generations'));
}

function readNotes(store) {
  const raw = store.get(PREFIX + 'notes');
  return raw ? JSON.parse(raw) : null;
}

test('saving a session persists it across a reload with an id and timestamps', () => {
  const store = createStore();
  const first = createEnvironment(store);
  const result = makeResult();

  const saved = first.history.save(result);

  assert.equal(saved.ok, true);
  assert.equal(saved.record.id, result.id);
  assert.equal(saved.record.createdAt, result.createdAt);
  assert.ok(saved.record.savedAt);
  assert.ok(saved.record.updatedAt);
  assert.ok(!Number.isNaN(new Date(saved.record.savedAt).getTime()));

  const envelope = readEnvelope(store);
  assert.equal(envelope.version, 2);
  assert.equal(envelope.records.length, 1);

  const reloaded = createEnvironment(store);
  const records = reloaded.history.all();

  assert.equal(records.length, 1);
  assert.equal(records[0].id, result.id);
  assert.equal(records[0].topic, result.topic);
  assert.equal(records[0].notes, result.notes);
  assert.equal(records[0].summary.text, result.summary.text);
});

test('saving the same session twice updates it without creating a duplicate', () => {
  const env = createEnvironment(createStore());
  const result = makeResult();

  const first = env.history.save(result);
  const second = env.history.save(result);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(env.history.all().length, 1);
  assert.equal(readEnvelope(env.store).records.length, 1);
  assert.equal(second.record.createdAt, first.record.createdAt);
  assert.equal(second.record.savedAt, first.record.savedAt);
});

test('large notes are stored once and referenced from records', () => {
  const env = createEnvironment(createStore());
  const notes = 'Shared lecture notes. '.repeat(500);

  env.history.save(makeResult({ id: 'study-a', notes }));
  env.history.save(makeResult({ id: 'study-b', notes }));

  const envelope = readEnvelope(env.store);
  const noteStore = readNotes(env.store);

  assert.equal(envelope.records.length, 2);
  assert.equal(Object.keys(noteStore.notes).length, 1);
  assert.equal(noteStore.notes[Object.keys(noteStore.notes)[0]].text, notes);
  assert.ok(envelope.records.every((record) => !('notes' in record)));
  assert.ok(envelope.records.every((record) => typeof record.notesRef === 'string'));
  assert.equal(env.history.all()[0].notes, notes);

  env.history.remove('study-a');
  assert.equal(Object.keys(readNotes(env.store).notes).length, 1);

  env.history.remove('study-b');
  assert.equal(Object.keys(readNotes(env.store).notes).length, 0);
});

test('legacy unversioned arrays are migrated without losing data', () => {
  const legacy = makeResult({ id: 'legacy-1' });
  delete legacy.config;
  delete legacy.progress;
  const store = createStore({
    [PREFIX + 'generations']: JSON.stringify([legacy])
  });

  const env = createEnvironment(store);
  const records = env.history.all();

  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'legacy-1');
  assert.equal(records[0].topic, legacy.topic);
  assert.equal(records[0].notes, legacy.notes);
  assert.deepEqual(records[0].progress, {
    quiz: { answers: {} },
    flashcards: { known: [], reviewed: [] }
  });

  const envelope = readEnvelope(store);
  assert.equal(envelope.version, 2);
  assert.equal(envelope.records.length, 1);
  assert.ok(!('notes' in envelope.records[0]));
  assert.ok(readNotes(store).notes[envelope.records[0].notesRef]);
});

test('corrupt history is preserved in a backup instead of being replaced', () => {
  const raw = '{this is not valid json';
  const env = createEnvironment(
    createStore({
      [PREFIX + 'generations']: raw
    })
  );

  const records = env.history.all();

  assert.deepEqual(records, []);
  assert.ok(
    env.history.getIssues().some((issue) => issue.code === 'corrupt-history')
  );
  assert.equal(env.history.getIssues().slice(-1)[0].message.includes('preserved'), true);

  const backups = JSON.parse(env.store.get(PREFIX + 'generations:backup'));
  assert.equal(backups.length, 1);
  assert.equal(backups[0].kind, 'generations');
  assert.equal(backups[0].raw, raw);
  assert.equal(env.store.get(PREFIX + 'generations'), raw);
});

test('corrupt notes are preserved while valid session metadata still loads', () => {
  const result = makeResult({ id: 'study-notes' });
  const store = createStore();
  const setup = createEnvironment(store);
  setup.history.save(result);

  const envelope = readEnvelope(store);
  store.set(PREFIX + 'notes', '[not an object');

  const env = createEnvironment(store);
  const records = env.history.all();

  assert.equal(records.length, 1);
  assert.equal(records[0].id, 'study-notes');
  assert.equal(records[0].summary.title, result.summary.title);
  assert.equal(records[0].notes, undefined);
  assert.ok(env.history.getIssues().some((issue) => issue.code === 'corrupt-notes'));
  assert.equal(JSON.parse(env.store.get(PREFIX + 'generations:backup'))[0].raw, '[not an object');
  assert.equal(envelope.version, 2);
});

test('a newer schema is left untouched and reported', () => {
  const raw = JSON.stringify({
    version: 99,
    records: [makeResult({ id: 'future-1' })]
  });
  const env = createEnvironment(createStore({ [PREFIX + 'generations']: raw }));

  assert.deepEqual(env.history.all(), []);
  assert.ok(
    env.history.getIssues().some((issue) => issue.code === 'unsupported-version')
  );
  assert.equal(env.store.get(PREFIX + 'generations'), raw);
});

test('quota failures are reported clearly and do not crash the app', () => {
  const env = createEnvironment(createStore(), { quota: true });

  const saved = env.history.save(makeResult());

  assert.equal(saved.ok, false);
  assert.equal(saved.reason, 'quota');
  assert.match(saved.message, /storage is full/i);
  assert.equal(env.store.has(PREFIX + 'generations'), false);
  assert.equal(env.history.all().length, 1);
});

test('blocked storage falls back to an in-memory session without persistence', () => {
  const env = createEnvironment(createStore(), { blocked: true });

  const saved = env.history.save(makeResult());

  assert.equal(saved.ok, false);
  assert.equal(saved.reason, 'unavailable');
  assert.match(saved.message, /blocking local storage/i);
  assert.equal(env.history.all().length, 1);
});

test('progress updates normalise answers and track known and reviewed cards', () => {
  const env = createEnvironment(createStore());
  env.history.save(makeResult());

  const updated = env.history.updateProgress('study-test-1', {
    quiz: { answers: { q1: 0, q2: 1, q3: 9, bogus: 0 } },
    flashcards: { known: ['fc1', 'fc1', 'missing'], reviewed: ['fc2', 'fc1', 'missing'] }
  });

  assert.equal(updated.ok, true);
  assert.deepEqual(updated.record.progress.quiz.answers, { q1: 0, q2: 1 });
  assert.deepEqual(updated.record.progress.flashcards.known, ['fc1']);
  assert.deepEqual(updated.record.progress.flashcards.reviewed, ['fc2', 'fc1']);

  const reloaded = createEnvironment(env.store).history.get('study-test-1');
  assert.deepEqual(reloaded.progress.flashcards.known, ['fc1']);
  assert.deepEqual(reloaded.progress.flashcards.reviewed, ['fc2', 'fc1']);
});

test('quiz scoring counts each question once and supports partial attempts', () => {
  const env = createEnvironment(createStore());
  const result = makeResult();
  const correctAnswers = {};
  result.quiz.forEach((question) => {
    correctAnswers[question.id] = question.correctAnswer;
  });

  const complete = env.analytics.scoreRecord(
    Object.assign({}, result, {
      progress: { quiz: { answers: correctAnswers }, flashcards: {} }
    })
  );

  assert.deepEqual(
    { answered: complete.answered, correct: complete.correct, total: complete.total },
    { answered: 5, correct: 5, total: 5 }
  );
  assert.equal(complete.percent, 100);
  assert.equal(complete.started, true);
  assert.equal(complete.complete, true);

  const partial = env.analytics.scoreRecord(
    Object.assign({}, result, {
      progress: {
        quiz: { answers: { q1: result.quiz[0].correctAnswer, q2: 99 } },
        flashcards: {}
      }
    })
  );

  assert.equal(partial.answered, 1);
  assert.equal(partial.correct, 1);
  assert.equal(partial.percent, 20);
  assert.equal(partial.started, true);
  assert.equal(partial.complete, false);
});

test('repeated progress updates do not count one session as multiple quiz attempts', () => {
  const env = createEnvironment(createStore());
  env.history.save(makeResult());
  const answers = {};
  makeQuiz().forEach((question) => {
    answers[question.id] = question.correctAnswer;
  });

  env.history.updateProgress('study-test-1', {
    quiz: { answers: { q1: 0 } },
    flashcards: { known: [], reviewed: [] }
  });
  env.history.updateProgress('study-test-1', {
    quiz: { answers },
    flashcards: { known: ['fc1'], reviewed: ['fc1'] }
  });

  const stats = env.analytics.computeStats(env.history.all());
  assert.equal(stats.totalSessions, 1);
  assert.equal(stats.quizAttempts, 1);
  assert.equal(stats.quizzesCompleted, 1);
  assert.equal(stats.averageScore, 100);
  assert.equal(stats.masteredCards, 1);
});

test('flashcard mastery deduplicates known and reviewed ids', () => {
  const env = createEnvironment(createStore());
  const mastery = env.analytics.masteryForRecord(
    Object.assign({}, makeResult(), {
      progress: {
        quiz: { answers: {} },
        flashcards: {
          known: ['fc1', 'fc1', 'missing'],
          reviewed: ['fc2', 'fc1', 'missing', 'fc2']
        }
      }
    })
  );

  assert.equal(mastery.known, 1);
  assert.equal(mastery.reviewed, 2);
  assert.equal(mastery.total, 2);

  const withoutReviewed = env.analytics.masteryForRecord(
    Object.assign({}, makeResult(), {
      progress: { quiz: { answers: {} }, flashcards: { known: ['fc2'] } }
    })
  );

  assert.equal(withoutReviewed.known, 1);
  assert.equal(withoutReviewed.reviewed, 1);
});

test('search and filters use saved metadata and never mutate source order', () => {
  const env = createEnvironment(createStore());

  env.history.save(
    makeResult({
      id: 'study-immune',
      createdAt: '2026-10-20T10:00:00.000Z',
      topic: 'The adaptive immune system'
    })
  );
  env.history.save(
    makeResult({
      id: 'study-calculus',
      createdAt: '2026-10-22T10:00:00.000Z',
      topic: 'Differential calculus',
      config: {
        answerStyle: 'kid',
        answerStyleLabel: "Explain Like I'm 10",
        difficulty: 'easy',
        difficultyLabel: 'Easy'
      }
    })
  );
  env.history.save(
    makeResult({
      id: 'study-organic',
      createdAt: '2026-10-24T10:00:00.000Z',
      topic: 'Organic chemistry',
      config: {
        answerStyle: 'detailed',
        answerStyleLabel: 'Detailed',
        difficulty: 'hard',
        difficultyLabel: 'Hard'
      }
    })
  );

  env.history.updateProgress('study-immune', {
    quiz: {
      answers: {
        q1: 0,
        q2: 1,
        q3: 2,
        q4: 3,
        q5: 0
      }
    }
  });
  env.history.updateProgress('study-calculus', {
    quiz: { answers: { q1: 0 } },
    flashcards: { known: ['fc1'], reviewed: ['fc1'] }
  });

  const records = env.history.all();
  const originalOrder = records.map((record) => record.id);

  assert.deepEqual(
    env.analytics
      .filterRecords(records, { query: 'immune' })
      .map((record) => record.id),
    ['study-immune']
  );
  assert.deepEqual(
    env.analytics
      .filterRecords(records, { query: 'IMMUNE' })
      .map((record) => record.id),
    ['study-immune']
  );
  assert.deepEqual(
    env.analytics
      .filterRecords(records, { difficulty: 'hard' })
      .map((record) => record.id),
    ['study-organic']
  );
  assert.deepEqual(
    env.analytics
      .filterRecords(records, { answerStyle: 'kid' })
      .map((record) => record.id),
    ['study-calculus']
  );
  assert.deepEqual(
    env.analytics
      .filterRecords(records, { status: 'completed' })
      .map((record) => record.id),
    ['study-immune']
  );
  assert.deepEqual(
    env.analytics
      .filterRecords(records, { status: 'in-progress' })
      .map((record) => record.id),
    ['study-calculus']
  );
  assert.deepEqual(
    env.analytics
      .filterRecords(records, { status: 'not-started' })
      .map((record) => record.id),
    ['study-organic']
  );
  assert.deepEqual(
    env.analytics
      .filterRecords(records, { status: 'known' })
      .map((record) => record.id),
    ['study-calculus']
  );

  assert.deepEqual(
    records.map((record) => record.id),
    originalOrder
  );
});

test('deleting a session updates history and every derived statistic', () => {
  const env = createEnvironment(createStore());

  env.history.save(makeResult({ id: 'study-a', createdAt: '2026-10-20T10:00:00.000Z' }));
  env.history.save(makeResult({ id: 'study-b', createdAt: '2026-10-22T10:00:00.000Z' }));

  env.history.updateProgress('study-a', {
    quiz: {
      answers: { q1: 0, q2: 1, q3: 2, q4: 3, q5: 0 }
    }
  });
  env.history.updateProgress('study-b', {
    quiz: { answers: { q1: 1, q2: 1 } }
  });

  const before = env.analytics.computeStats(env.history.all());
  assert.equal(before.totalSessions, 2);
  assert.equal(before.quizAttempts, 2);
  assert.equal(before.quizzesCompleted, 1);
  assert.equal(before.totalMinutes, 48);

  const removed = env.history.remove('study-a');

  assert.equal(removed.ok, true);
  assert.equal(env.history.get('study-a'), null);

  const after = env.analytics.computeStats(env.history.all());
  assert.equal(after.totalSessions, 1);
  assert.equal(after.quizAttempts, 1);
  assert.equal(after.quizzesCompleted, 0);
  assert.equal(after.averageScore, 20);
  assert.equal(after.totalMinutes, 24);

  assert.equal(env.history.remove('missing').ok, false);
});

test('empty history and zero activity produce honest empty analytics', () => {
  const env = createEnvironment(createStore());
  const stats = env.analytics.computeStats([]);

  assert.equal(stats.totalSessions, 0);
  assert.equal(stats.totalMinutes, 0);
  assert.equal(stats.quizAttempts, 0);
  assert.equal(stats.quizzesCompleted, 0);
  assert.equal(stats.answeredQuestions, 0);
  assert.equal(stats.averageScore, null);
  assert.equal(stats.completedAverage, null);
  assert.equal(stats.topScore, 0);
  assert.equal(stats.masteredCards, 0);
  assert.equal(stats.reviewedCards, 0);
  assert.equal(stats.totalCards, 0);
  assert.equal(stats.cardProgress, 0);
  assert.equal(stats.topicCount, 0);
  assert.equal(stats.streak, 0);
  assert.equal(stats.weekSessions, 0);
  assert.equal(stats.activity.length, env.analytics.ACTIVITY_DAYS);

  assert.deepEqual(env.analytics.filterRecords([], { query: 'anything' }), []);
  assert.equal(env.history.get('missing'), null);

  env.history.clear();
  assert.equal(env.history.all().length, 0);
});

test('sessions are returned newest first and activity is derived from saved dates', () => {
  const env = createEnvironment(createStore());

  env.history.save(makeResult({ id: 'older', createdAt: '2026-10-01T10:00:00.000Z' }));
  env.history.save(makeResult({ id: 'newer', createdAt: '2026-10-25T10:00:00.000Z' }));

  assert.deepEqual(
    env.history.all().map((record) => record.id),
    ['newer', 'older']
  );

  const now = new Date('2026-10-25T18:00:00.000Z').getTime();
  const activity = env.analytics.activityForRecords(env.history.all(), {
    days: 7,
    now
  });

  assert.equal(activity.length, 7);
  assert.equal(activity[0].daysAgo, 0);
  assert.equal(activity[0].minutes, 24);
  assert.equal(
    activity.reduce((total, day) => total + day.minutes, 0),
    24
  );

  assert.equal(
    env.analytics.streakForRecords(env.history.all(), now),
    1
  );
});
