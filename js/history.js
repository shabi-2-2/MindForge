/**
 * MindForge generation history
 * A defensive, modular store for completed study generations. Records keep the
 * full generated result plus per-session quiz answers and flashcard mastery so
 * a session can be reopened exactly where it was left. All writes go through
 * MindForgeStorage, which means a blocked or full localStorage degrades to an
 * in-page store instead of breaking the workspace.
 */
(function (global) {
  'use strict';

  var storage = global.MindForgeStorage;
  var contract = global.MindForgeContract;

  if (!storage) {
    return;
  }

  var KEY = 'generations';
  var LIMIT = 30;

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function normaliseStoredValue(value) {
    if (!contract || typeof contract.normaliseStoredResult !== 'function') {
      return null;
    }

    return contract.normaliseStoredResult(value);
  }

  function isResult(value) {
    return Boolean(
      isObject(value) &&
        typeof value.id === 'string' &&
        value.id &&
        normaliseStoredValue(value)
    );
  }

  function emptyProgress() {
    return {
      quiz: { answers: {} },
      flashcards: { known: [] }
    };
  }

  function normaliseProgress(progress, record) {
    var source = isObject(progress) ? progress : {};
    var quiz = isObject(source.quiz) ? source.quiz : {};
    var cards = isObject(source.flashcards) ? source.flashcards : {};
    var answers = isObject(quiz.answers) ? quiz.answers : {};
    var validQuestions = Object.create(null);
    var validCards = Object.create(null);
    var normalised = emptyProgress();

    record.quiz.forEach(function (question) {
      if (question && typeof question.id === 'string') {
        validQuestions[question.id] = question;
      }
    });

    record.flashcards.forEach(function (card) {
      if (card && typeof card.id === 'string') {
        validCards[card.id] = true;
      }
    });

    Object.keys(answers).forEach(function (id) {
      var question = validQuestions[id];
      var selected = answers[id];

      if (
        question &&
        typeof selected === 'number' &&
        isFinite(selected) &&
        Math.floor(selected) === selected &&
        selected >= 0 &&
        selected < question.options.length
      ) {
        normalised.quiz.answers[id] = selected;
      }
    });

    if (Array.isArray(cards.known)) {
      var seen = Object.create(null);

      cards.known.forEach(function (id) {
        if (typeof id === 'string' && validCards[id] && !seen[id]) {
          seen[id] = true;
          normalised.flashcards.known.push(id);
        }
      });
    }

    return normalised;
  }

  function normaliseRecord(value) {
    if (
      !isObject(value) ||
      typeof value.id !== 'string' ||
      !value.id
    ) {
      return null;
    }

    var record = normaliseStoredValue(value);

    if (!record) {
      return null;
    }

    record.id = value.id;
    record.progress = normaliseProgress(value.progress, record);
    record.createdAt =
      typeof value.createdAt === 'string' && value.createdAt
        ? value.createdAt
        : typeof value.savedAt === 'string' && value.savedAt
          ? value.savedAt
          : new Date().toISOString();
    record.savedAt =
      typeof value.savedAt === 'string' && value.savedAt
        ? value.savedAt
        : record.createdAt;
    record.updatedAt =
      typeof value.updatedAt === 'string' && value.updatedAt
        ? value.updatedAt
        : record.savedAt;

    return record;
  }

  function sortRecords(records) {
    return records.slice().sort(function (a, b) {
      var left = new Date(b.createdAt).getTime() || 0;
      var right = new Date(a.createdAt).getTime() || 0;
      return left - right;
    });
  }

  function readAll() {
    var raw = storage.get(KEY, []);
    var records = [];

    if (!Array.isArray(raw)) {
      return records;
    }

    raw.forEach(function (value) {
      var record = normaliseRecord(value);

      if (record) {
        records.push(record);
      }
    });

    return sortRecords(records);
  }

  function notify(reason, records) {
    document.dispatchEvent(
      new CustomEvent('mindforge:historychange', {
        detail: {
          reason: reason,
          records: records
        }
      })
    );
  }

  function writeAll(records, reason) {
    var persisted = storage.set(KEY, records);

    if (persisted) {
      notify(reason, sortRecords(records));
    }

    return persisted;
  }

  function all() {
    return readAll();
  }

  function get(id) {
    var records = readAll();

    for (var index = 0; index < records.length; index += 1) {
      if (records[index].id === id) {
        return records[index];
      }
    }

    return null;
  }

  function save(result) {
    if (!isResult(result)) {
      return { ok: false, record: null, reason: 'invalid' };
    }

    var records = readAll();
    var existing = null;

    records.forEach(function (record) {
      if (record.id === result.id) {
        existing = record;
      }
    });

    var record = normaliseRecord(result);

    if (!record) {
      return { ok: false, record: null, reason: 'invalid' };
    }

    record.progress = normaliseProgress(
      existing ? existing.progress : result.progress,
      record
    );
    record.savedAt = existing ? existing.savedAt : new Date().toISOString();
    record.updatedAt = new Date().toISOString();

    records = records.filter(function (item) {
      return item.id !== record.id;
    });
    records.unshift(record);
    records = sortRecords(records).slice(0, LIMIT);

    var ok = writeAll(records, 'save');

    return { ok: ok, record: record, reason: ok ? '' : 'write-failed' };
  }

  function updateProgress(id, progress) {
    var records = readAll();
    var updated = null;

    records.forEach(function (record) {
      if (record.id !== id) {
        return;
      }

      record.progress = normaliseProgress(progress, record);
      record.updatedAt = new Date().toISOString();
      updated = record;
    });

    if (!updated) {
      return { ok: false, record: null, reason: 'missing' };
    }

    var ok = writeAll(records, 'progress');

    return { ok: ok, record: updated, reason: ok ? '' : 'write-failed' };
  }

  function remove(id) {
    var records = readAll();
    var removed = null;

    records = records.filter(function (record) {
      if (record.id === id) {
        removed = record;
        return false;
      }

      return true;
    });

    if (!removed) {
      return { ok: false, record: null, reason: 'missing' };
    }

    var ok = writeAll(records, 'remove');

    return { ok: ok, record: removed, reason: ok ? '' : 'write-failed' };
  }

  function clear() {
    var records = readAll();

    storage.remove(KEY);
    notify('clear', records);

    return records.length;
  }

  global.addEventListener('storage', function (event) {
    if (event.key !== storage.prefix + KEY) {
      return;
    }

    notify('external', readAll());
  });

  global.MindForgeHistory = Object.freeze({
    all: all,
    get: get,
    save: save,
    updateProgress: updateProgress,
    remove: remove,
    clear: clear,
    storageKey: storage.prefix + KEY,
    limit: LIMIT,
    isPersistent: storage.isPersistent
  });
})(window);
