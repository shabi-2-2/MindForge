import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadRuntime() {
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
    isFinite,
    setTimeout
  };

  context.window = context;
  context.globalThis = context;
  vm.createContext(context);

  ['js/study-contract.js', 'js/mock-generator.js', 'js/api-config.js', 'js/generation.js'].forEach(
    (file) => {
      vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {
        filename: file
      });
    }
  );

  return context;
}

const runtime = loadRuntime();
const contract = runtime.MindForgeContract;
const generator = runtime.MindForgeGenerator;
const generation = runtime.MindForgeGeneration;

const validInput = {
  topic: '  The adaptive immune system  ',
  notes:
    'The adaptive immune system remembers pathogens it has met before. ' +
    'Antibodies bind specific antigens and mark them for destruction. ' +
    'Memory cells respond faster when the same pathogen returns.',
  answerStyle: 'exam',
  difficulty: 'medium'
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

async function makeResult() {
  return generator.generate(validInput, { delay: 0 });
}

function failurePath(result) {
  return result.errors.length ? result.errors[0].path : null;
}

test('request validation trims values and accepts valid settings', () => {
  const result = contract.validateRequest(validInput);

  assert.equal(result.ok, true);
  assert.equal(result.value.topic, 'The adaptive immune system');
  assert.match(result.value.notes, /^The adaptive/);
  assert.equal(result.value.answerStyle, 'exam');
  assert.equal(result.value.difficulty, 'medium');
});

test('request validation rejects empty and whitespace-only input', () => {
  const result = contract.validateRequest({
    topic: '   ',
    notes: '\n\t  ',
    answerStyle: 'exam',
    difficulty: 'medium'
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => [error.field, error.code]),
    [
      ['topic', 'required'],
      ['notes', 'required']
    ]
  );
});

test('request validation rejects content over the configured limits', () => {
  const limits = contract.getLimits();
  const result = contract.validateRequest({
    topic: 'x'.repeat(limits.topic + 1),
    notes: 'n'.repeat(limits.notes + 1),
    answerStyle: 'exam',
    difficulty: 'medium'
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.field),
    ['topic', 'notes']
  );
});

test('request limits are configurable', () => {
  const original = contract.getLimits();

  try {
    contract.configure({ topic: 10, notes: 12 });
    assert.deepEqual(contract.getLimits(), { topic: 10, notes: 12 });
    assert.equal(
      contract.validateRequest({
        topic: 'short',
        notes: '012345678901',
        answerStyle: 'exam',
        difficulty: 'medium'
      }).ok,
      true
    );
    assert.equal(
      contract.validateRequest({
        topic: 'short',
        notes: '0123456789012',
        answerStyle: 'exam',
        difficulty: 'medium'
      }).ok,
      false
    );
  } finally {
    contract.configure(original);
  }
});

test('request validation rejects invalid answer style and difficulty', () => {
  const result = contract.validateRequest({
    topic: 'Cells',
    notes: 'Cells contain organelles.',
    answerStyle: 'poetic',
    difficulty: 'impossible'
  });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map((error) => error.field),
    ['answerStyle', 'difficulty']
  );
});

test('the mock generator conforms to the response contract', async () => {
  const result = await makeResult();
  const validation = contract.validateResponse(result);

  assert.equal(validation.ok, true);
  assert.equal(result.quiz.length, 5);
  assert.equal(result.summary.keyConcepts.length > 0, true);
  assert.equal(result.summary.text.trim().length > 0, true);

  result.quiz.forEach((question) => {
    assert.equal(question.options.length, 4);
    assert.equal(Number.isInteger(question.correctAnswer), true);
    assert.ok(question.correctAnswer >= 0 && question.correctAnswer <= 3);
    assert.equal(question.explanation.trim().length > 0, true);
    question.options.forEach((option) => {
      assert.equal(option.trim().length > 0, true);
    });
  });

  assert.equal(result.flashcards.length > 0, true);
  result.flashcards.forEach((card) => {
    assert.equal(card.front.trim().length > 0, true);
    assert.equal(card.back.trim().length > 0, true);
  });
});

test('the generation service validates requests and returns contract data', async () => {
  generation.setProvider(
    (input) => generator.generate(input, { delay: 0 }),
    'test-mock'
  );

  try {
    const result = await generation.generate(validInput);
    assert.equal(contract.validateResponse(result).ok, true);

    await assert.rejects(
      generation.generate({
        topic: '   ',
        notes: '',
        answerStyle: 'exam',
        difficulty: 'medium'
      }),
      (error) => {
        assert.equal(error.code, 'invalid-request');
        assert.equal(error.recoverable, false);
        return true;
      }
    );
  } finally {
    generation.resetProvider();
  }
});

test('the default provider posts to the backend generate URL', async () => {
  const calls = [];
  const payload = await makeResult();

  runtime.fetch = (url, options) => {
    calls.push({ url, options });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(payload)
    });
  };
  generation.resetProvider();

  try {
    const result = await generation.generate(validInput);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'http://127.0.0.1:8000/api/generate');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['Content-Type'], 'application/json');

    const body = JSON.parse(calls[0].options.body);
    assert.deepEqual(Object.keys(body).sort(), [
      'answerStyle',
      'difficulty',
      'notes',
      'topic'
    ]);
    assert.equal(body.topic, 'The adaptive immune system');
    assert.equal(body.answerStyle, 'exam');
    assert.equal(body.difficulty, 'medium');
    assert.equal(contract.validateResponse(result).ok, true);
  } finally {
    delete runtime.fetch;
    generation.resetProvider();
  }
});

test('the default provider never falls back to mock content', async () => {
  generation.resetProvider();
  runtime.fetch = () => Promise.reject(new Error('network down'));

  try {
    await assert.rejects(
      generation.generate(validInput),
      (error) => {
        assert.equal(error.code, 'provider-unavailable');
        assert.equal(error.recoverable, true);
        return true;
      }
    );
  } finally {
    delete runtime.fetch;
  }

  runtime.fetch = () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ summary: {}, quiz: [], flashcards: [] })
    });

  try {
    await assert.rejects(
      generation.generate(validInput),
      (error) => {
        assert.equal(error.code, 'invalid-response');
        return true;
      }
    );
  } finally {
    delete runtime.fetch;
    generation.resetProvider();
  }
});

test('invalid Gemini output is distinguished from a network failure', async () => {
  generation.resetProvider();
  runtime.fetch = () =>
    Promise.resolve({
      ok: false,
      status: 502,
      json: () =>
        Promise.resolve({
          detail: {
            code: 'invalid_provider_response',
            message: 'Gemini returned incomplete or unusable study material. Please try again.'
          }
        })
    });

  try {
    await assert.rejects(
      generation.generate(validInput),
      (error) => {
        assert.equal(error.code, 'invalid-provider-response');
        assert.equal(error.recoverable, true);
        assert.match(error.message, /unusable/);
        return true;
      }
    );
  } finally {
    delete runtime.fetch;
    generation.resetProvider();
  }
});

test('the response validator enforces every contract rule', async (t) => {
  const base = await makeResult();

  const cases = [
    ['missing summary text', (result) => {
      result.summary.text = '   ';
    }, 'summary.text'],
    ['empty key concepts', (result) => {
      result.summary.keyConcepts = [];
    }, 'summary.keyConcepts'],
    ['non-string key concept', (result) => {
      result.summary.keyConcepts = ['Valid', ''];
    }, 'summary.keyConcepts[1]'],
    ['wrong quiz count', (result) => {
      result.quiz.pop();
    }, 'quiz'],
    ['missing quiz', (result) => {
      delete result.quiz;
    }, 'quiz'],
    ['wrong option count', (result) => {
      result.quiz[0].options.pop();
    }, 'quiz[0].options'],
    ['empty option', (result) => {
      result.quiz[0].options[1] = '   ';
    }, 'quiz[0].options[1]'],
    ['answer index above range', (result) => {
      result.quiz[0].correctAnswer = 4;
    }, 'quiz[0].correctAnswer'],
    ['negative answer index', (result) => {
      result.quiz[0].correctAnswer = -1;
    }, 'quiz[0].correctAnswer'],
    ['fractional answer index', (result) => {
      result.quiz[0].correctAnswer = 1.5;
    }, 'quiz[0].correctAnswer'],
    ['string answer index', (result) => {
      result.quiz[0].correctAnswer = '0';
    }, 'quiz[0].correctAnswer'],
    ['empty explanation', (result) => {
      result.quiz[0].explanation = '';
    }, 'quiz[0].explanation'],
    ['missing flashcards', (result) => {
      result.flashcards = [];
    }, 'flashcards'],
    ['missing flashcard front', (result) => {
      result.flashcards[0].front = '';
    }, 'flashcards[0].front'],
    ['missing flashcard back', (result) => {
      result.flashcards[0].back = '   ';
    }, 'flashcards[0].back']
  ];

  for (const [name, mutate, expectedPath] of cases) {
    await t.test(name, () => {
      const result = clone(base);
      mutate(result);
      const validation = contract.validateResponse(result);

      assert.equal(validation.ok, false);
      assert.equal(failurePath(validation), expectedPath);
      assert.equal(validation.value, null);
    });
  }
});

test('an invalid provider response is rejected by the service', async () => {
  const malformed = await makeResult();

  malformed.quiz[0].correctAnswer = 9;

  generation.setProvider(() => Promise.resolve(malformed), 'bad-mock');

  try {
    await assert.rejects(
      generation.generate(validInput),
      (error) => {
        assert.equal(error.code, 'invalid-response');
        assert.equal(error.recoverable, false);
        assert.equal(Array.isArray(error.diagnostics.errors), true);
        return true;
      }
    );
  } finally {
    generation.resetProvider();
  }
});

test('a simulated provider failure is recoverable and does not leak notes', async () => {
  generation.setProvider(
    () => Promise.reject(new Error('raw provider detail with private notes')),
    'failing-mock'
  );

  try {
    await assert.rejects(
      generation.generate(validInput),
      (error) => {
        assert.equal(error.code, 'generation-failed');
        assert.equal(error.recoverable, true);
        assert.deepEqual(error.diagnostics, {
          cause: { name: 'Error' }
        });
        return true;
      }
    );
  } finally {
    generation.resetProvider();
  }
});

test('legacy Phase 0 records migrate to the Phase 1 contract', async () => {
  const current = await makeResult();
  const legacy = {
    id: 'study-legacy',
    createdAt: current.createdAt,
    topic: current.topic,
    notes: current.notes,
    config: current.config,
    summary: {
      title: current.summary.title,
      overview: current.summary.text,
      keyPoints: current.summary.keyConcepts,
      estimatedMinutes: current.summary.estimatedMinutes
    },
    quiz: {
      difficulty: 'medium',
      difficultyLabel: 'Medium',
      questions: current.quiz.map((question) => ({
        id: question.id,
        prompt: question.question,
        options: question.options,
        answerIndex: question.correctAnswer,
        explanation: question.explanation
      }))
    },
    flashcards: current.flashcards,
    meta: current.meta
  };
  const normalised = contract.normaliseStoredResult(legacy);

  assert.ok(normalised);
  assert.equal(normalised.summary.text, legacy.summary.overview);
  assert.deepEqual(normalised.summary.keyConcepts, legacy.summary.keyPoints);
  assert.equal(normalised.quiz[0].question, legacy.quiz.questions[0].prompt);
  assert.equal(
    normalised.quiz[0].correctAnswer,
    legacy.quiz.questions[0].answerIndex
  );
  assert.equal(normalised.summary.title, legacy.summary.title);
  assert.equal(normalised.config.difficultyLabel, 'Medium');
});
