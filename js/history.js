/**
 * MindForge generation history
 * A defensive, modular store for completed study generations.
 *
 * Storage layout (all keys are prefixed by MindForgeStorage):
 *   mindforge:generations   Versioned envelope: { version, updatedAt, records }
 *   mindforge:notes         Content-addressed notes: { version, notes: { ref: text } }
 *   mindforge:generations:backup  Preserved raw payloads that could not be read
 *
 * Records hold the generated study material plus per-session quiz answers and
 * flashcard progress. Large notes live once in the notes store and are
 * referenced by hash so the same notes are never duplicated across records.
 * Legacy unversioned arrays are migrated on read without discarding data.
 */
(function (global) {
  'use strict';

  var storage = global.MindForgeStorage;
  var contract = global.MindForgeContract;

  if (!storage) {
    return;
  }

  var KEY = 'generations';
  var NOTES_KEY = 'notes';
  var BACKUP_KEY = 'generations:backup';
  var SCHEMA_VERSION = 2;
  var NOTES_SCHEMA_VERSION = 1;
  var LIMIT = 30;
  var MAX_BACKUPS = 3;

  var issues = [];

  function isObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function nowIso() {
    return new Date().toISOString();
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

  function normaliseStoredValue(value) {
    if (!contract || typeof contract.normaliseStoredResult !== 'function') {
      return null;
    }

    return contract.normaliseStoredResult(value);
  }

  function hashText(value) {
    var text = String(value);
    var hash = 2166136261;

    for (var index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }

    return (
      'n-' +
      ('00000000' + (hash >>> 0).toString(16)).slice(-8) +
      '-' +
      text.length.toString(36)
    );
  }

  function recordIssue(code, message, extra) {
    var issue = {
      code: code,
      message: message,
      at: nowIso()
    };

    if (isObject(extra)) {
      Object.keys(extra).forEach(function (key) {
        issue[key] = extra[key];
      });
    }

    issues.push(issue);

    if (issues.length > 20) {
      issues.shift();
    }

    return issue;
  }

  function preserveRaw(kind, raw) {
    if (typeof raw !== 'string' || !raw) {
      return;
    }

    var current = storage.getDetailed(BACKUP_KEY, []);
    var backups = Array.isArray(current.value) ? current.value.slice() : [];

    backups.push({
      kind: kind,
      capturedAt: nowIso(),
      raw: raw
    });

    backups = backups.slice(-MAX_BACKUPS);
    storage.setRaw(BACKUP_KEY, JSON.stringify(backups));
  }

  function emptyProgress() {
    return {
      quiz: { answers: {} },
      flashcards: { known: [], reviewed: [] }
    };
  }

  function uniqueIds(ids, valid) {
    var seen = Object.create(null);
    var values = [];

    if (!Array.isArray(ids)) {
      return values;
    }

    ids.forEach(function (id) {
      if (typeof id === 'string' && valid[id] && !seen[id]) {
        seen[id] = true;
        values.push(id);
      }
    });

    return values;
  }

  function normaliseProgress(progress, record) {
    var source = isObject(progress) ? progress : {};
    var quiz = isObject(source.quiz) ? source.quiz : {};
    var cards = isObject(source.flashcards) ? source.flashcards : {};
    var answers = isObject(quiz.answers) ? quiz.answers : {};
    var validQuestions = Object.create(null);
    var validCards = Object.create(null);
    var normalised = emptyProgress();

    (record.quiz || []).forEach(function (question) {
      if (question && typeof question.id === 'string') {
        validQuestions[question.id] = question;
      }
    });

    (record.flashcards || []).forEach(function (card) {
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

    normalised.flashcards.known = uniqueIds(cards.known, validCards);
    normalised.flashcards.reviewed = uniqueIds(cards.reviewed, validCards);
    normalised.flashcards.known.forEach(function (id) {
      if (normalised.flashcards.reviewed.indexOf(id) === -1) {
        normalised.flashcards.reviewed.push(id);
      }
    });

    return normalised;
  }

  function validTimestamp(value) {
    return typeof value === 'string' && value && !isNaN(new Date(value).getTime());
  }

  function ensureId(value) {
    if (isObject(value) && typeof value.id === 'string' && value.id.trim()) {
      return value.id.trim();
    }

    var seed;

    try {
      seed = JSON.stringify(value);
    } catch (error) {
      seed = String(value);
    }

    return 'legacy-' + hashText(seed || '');
  }

  function normaliseConfig(value) {
    if (!isObject(value)) {
      return {};
    }

    var config = {};

    ['answerStyle', 'answerStyleLabel', 'difficulty', 'difficultyLabel'].forEach(
      function (key) {
        if (typeof value[key] === 'string' && value[key]) {
          config[key] = value[key];
        }
      }
    );

    return config;
  }

  function normaliseRecord(value, notesStore) {
    if (!isObject(value)) {
      return null;
    }

    var source = clone(value);

    if (!isObject(source)) {
      return null;
    }

    source.id = ensureId(source);

    var record = normaliseStoredValue(source);

    if (!record) {
      return null;
    }

    record.id = source.id;
    record.config = normaliseConfig(source.config);

    if (typeof source.topic === 'string' && source.topic.trim()) {
      record.topic = source.topic.trim();
    }

    if (typeof source.notes === 'string') {
      record.notes = source.notes;
    } else if (
      typeof source.notesRef === 'string' &&
      notesStore &&
      notesStore[source.notesRef] &&
      typeof notesStore[source.notesRef].text === 'string'
    ) {
      record.notes = notesStore[source.notesRef].text;
    }

    if (typeof source.notesRef === 'string' && source.notesRef) {
      record.notesRef = source.notesRef;
    } else if (typeof record.notes === 'string' && record.notes.length) {
      record.notesRef = hashText(record.notes);
    }

    record.progress = normaliseProgress(source.progress, record);
    record.createdAt = validTimestamp(source.createdAt)
      ? source.createdAt
      : validTimestamp(source.savedAt)
        ? source.savedAt
        : nowIso();
    record.savedAt = validTimestamp(source.savedAt)
      ? source.savedAt
      : record.createdAt;
    record.updatedAt = validTimestamp(source.updatedAt)
      ? source.updatedAt
      : record.savedAt;

    return record;
  }

  function toStoredRecord(record) {
    var stored = {};

    Object.keys(record).forEach(function (key) {
      if (key === 'notes') {
        return;
      }

      stored[key] = clone(record[key]);
    });

    if (typeof record.notes === 'string' && record.notes.length) {
      stored.notesRef = hashText(record.notes);
      stored.notesLength = record.notes.length;
    } else if (typeof record.notesRef === 'string' && record.notesRef) {
      stored.notesRef = record.notesRef;
    }

    return stored;
  }

  function recordTime(record) {
    var time = new Date(record.createdAt).getTime();
    return isNaN(time) ? 0 : time;
  }

  function sortRecords(records) {
    return records.slice().sort(function (left, right) {
      return recordTime(right) - recordTime(left);
    });
  }

  function dedupe(records) {
    var byId = Object.create(null);
    var order = [];

    records.forEach(function (record) {
      var existing = byId[record.id];

      if (!existing) {
        byId[record.id] = record;
        order.push(record.id);
        return;
      }

      var existingTime = new Date(existing.updatedAt).getTime() || 0;
      var nextTime = new Date(record.updatedAt).getTime() || 0;

      if (nextTime >= existingTime) {
        byId[record.id] = record;
      }
    });

    return order.map(function (id) {
      return byId[id];
    });
  }

  function readNotesStore() {
    var detailed = storage.getDetailed(NOTES_KEY, null);
    var notes = Object.create(null);

    if (!detailed.found) {
      return notes;
    }

    if (
      detailed.corrupt ||
      !isObject(detailed.value) ||
      !isObject(detailed.value.notes)
    ) {
      preserveRaw('notes', detailed.raw);
      recordIssue(
        'corrupt-notes',
        'Saved notes could not be read. The raw copy was preserved so it can be recovered.'
      );
      return notes;
    }

    Object.keys(detailed.value.notes).forEach(function (ref) {
      var entry = detailed.value.notes[ref];

      if (
        entry &&
        typeof entry.text === 'string' &&
        ref.indexOf('n-') === 0
      ) {
        notes[ref] = { text: entry.text };
      }
    });

    return notes;
  }

  function readRecordsContainer() {
    var detailed = storage.getDetailed(KEY, null);

    if (!detailed.found) {
      return { records: [], raw: null, legacy: false, corrupt: false };
    }

    if (detailed.corrupt) {
      preserveRaw('generations', detailed.raw);
      recordIssue(
        'corrupt-history',
        'Saved history could not be read. The raw copy was preserved instead of being replaced.'
      );
      return { records: [], raw: detailed.raw, legacy: false, corrupt: true };
    }

    if (Array.isArray(detailed.value)) {
      return {
        records: detailed.value,
        raw: detailed.raw,
        legacy: true,
        corrupt: false
      };
    }

    if (!isObject(detailed.value) || !Array.isArray(detailed.value.records)) {
      preserveRaw('generations', detailed.raw);
      recordIssue(
        'corrupt-history',
        'Saved history used an unexpected format. The raw copy was preserved.'
      );
      return { records: [], raw: detailed.raw, legacy: false, corrupt: true };
    }

    if (
      typeof detailed.value.version === 'number' &&
      detailed.value.version > SCHEMA_VERSION
    ) {
      preserveRaw('generations', detailed.raw);
      recordIssue(
        'unsupported-version',
        'Saved history was written by a newer version of MindForge. It was left untouched.'
      );
      return { records: [], raw: detailed.raw, legacy: false, corrupt: true };
    }

    return {
      records: detailed.value.records,
      raw: detailed.raw,
      legacy: false,
      corrupt: false
    };
  }

  function syncNotes(records) {
    var existing = readNotesStore();
    var next = Object.create(null);
    var changed = false;

    Object.keys(existing).forEach(function (ref) {
      next[ref] = existing[ref];
    });

    records.forEach(function (record) {
      if (typeof record.notes === 'string' && record.notes.length) {
        var ref = hashText(record.notes);

        if (!next[ref]) {
          next[ref] = { text: record.notes };
          changed = true;
        }

        record.notesRef = ref;
      }
    });

    var used = Object.create(null);

    records.forEach(function (record) {
      if (typeof record.notesRef === 'string' && record.notesRef) {
        used[record.notesRef] = true;
      }
    });

    Object.keys(next).forEach(function (ref) {
      if (!used[ref]) {
        delete next[ref];
        changed = true;
      }
    });

    var current = storage.getDetailed(NOTES_KEY, null);
    var currentValue = isObject(current.value) ? current.value : null;

    if (
      !changed &&
      currentValue &&
      currentValue.version === NOTES_SCHEMA_VERSION
    ) {
      return { ok: true, reason: '' };
    }

    var written = storage.setDetailed(NOTES_KEY, {
      version: NOTES_SCHEMA_VERSION,
      notes: next
    });

    if (!written.ok) {
      return { ok: false, reason: written.reason };
    }

    return { ok: true, reason: '' };
  }

  function notify(reason, records) {
    if (
      !global.document ||
      typeof global.document.dispatchEvent !== 'function' ||
      typeof global.CustomEvent !== 'function'
    ) {
      return;
    }

    global.document.dispatchEvent(
      new global.CustomEvent('mindforge:historychange', {
        detail: {
          reason: reason,
          records: records
        }
      })
    );
  }

  function failureMessage(reason) {
    if (reason === 'quota') {
      return (
        'Browser storage is full, so this session could not be saved. ' +
        'Delete a saved session or clear MindForge data in your browser settings, then try again.'
      );
    }

    if (reason === 'unavailable') {
      return (
        'This browser is blocking local storage. Your session is available in this tab ' +
        'but will disappear when you close it.'
      );
    }

    return 'This session could not be saved to this browser. Please try again.';
  }

  function writeAll(records, reason) {
    var sorted = sortRecords(dedupe(records)).slice(0, LIMIT);
    var notesResult = syncNotes(sorted);
    var written = storage.setDetailed(KEY, {
      version: SCHEMA_VERSION,
      updatedAt: nowIso(),
      records: sorted.map(toStoredRecord)
    });

    if (!notesResult.ok || !written.ok) {
      var failure = !written.ok ? written : notesResult;
      var message = failureMessage(failure.reason);

      recordIssue('write-failed', message, { reason: failure.reason });

      if (written.ok) {
        notify(reason, sorted);
      }

      return {
        ok: false,
        reason: failure.reason,
        message: message,
        records: sorted
      };
    }

    notify(reason, sorted);

    return { ok: true, reason: '', records: sorted };
  }

  function readAll() {
    var container = readRecordsContainer();
    var notesStore = readNotesStore();
    var records = [];

    container.records.forEach(function (value) {
      var record = normaliseRecord(value, notesStore);

      if (!record) {
        preserveRaw('invalid-record', safeStringify(value));
        recordIssue(
          'invalid-record',
          'A saved session was incomplete and could not be opened. Its raw copy was preserved.'
        );
        return;
      }

      records.push(record);
    });

    records = sortRecords(dedupe(records)).slice(0, LIMIT);

    if (container.legacy) {
      var migrated = writeAll(records, 'migrate');

      if (!migrated.ok) {
        recordIssue(
          'migration-failed',
          failureMessage(migrated.reason),
          { reason: migrated.reason }
        );
      }
    }

    return records;
  }

  function safeStringify(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
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
    if (!isObject(result)) {
      return {
        ok: false,
        record: null,
        reason: 'invalid',
        message: 'This study session could not be saved because its data is incomplete.'
      };
    }

    var source = clone(result);

    if (!isObject(source)) {
      return {
        ok: false,
        record: null,
        reason: 'invalid',
        message: 'This study session could not be saved because its data is incomplete.'
      };
    }

    source.id = ensureId(source);

    var records = readAll();
    var existing = null;

    records.forEach(function (record) {
      if (record.id === source.id) {
        existing = record;
      }
    });

    var record = normaliseRecord(source, null);

    if (!record) {
      return {
        ok: false,
        record: null,
        reason: 'invalid',
        message: 'This study session could not be saved because its content did not validate.'
      };
    }

    record.progress = normaliseProgress(
      existing
        ? existing.progress
        : hasOwn(source, 'progress')
          ? source.progress
          : null,
      record
    );
    record.createdAt = existing
      ? existing.createdAt
      : validTimestamp(source.createdAt)
        ? source.createdAt
        : nowIso();
    record.savedAt = existing ? existing.savedAt : nowIso();
    record.updatedAt = nowIso();

    records = records.filter(function (item) {
      return item.id !== record.id;
    });
    records.push(record);

    var written = writeAll(records, 'save');

    return {
      ok: written.ok,
      record: written.ok ? record : null,
      reason: written.reason,
      message: written.ok ? '' : written.message
    };
  }

  function updateProgress(id, progress) {
    var records = readAll();
    var updated = null;

    records.forEach(function (record) {
      if (record.id !== id) {
        return;
      }

      var merge = isObject(progress) ? progress : {};
      var merged = {
        quiz: hasOwn(merge, 'quiz') ? merge.quiz : record.progress.quiz,
        flashcards: hasOwn(merge, 'flashcards')
          ? merge.flashcards
          : record.progress.flashcards
      };

      record.progress = normaliseProgress(merged, record);
      record.updatedAt = nowIso();
      updated = record;
    });

    if (!updated) {
      return {
        ok: false,
        record: null,
        reason: 'missing',
        message: 'That saved session is no longer in History.'
      };
    }

    var written = writeAll(records, 'progress');

    return {
      ok: written.ok,
      record: written.ok ? updated : null,
      reason: written.reason,
      message: written.ok ? '' : written.message
    };
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
      return {
        ok: false,
        record: null,
        reason: 'missing',
        message: 'That saved session is no longer in History.'
      };
    }

    var written = writeAll(records, 'remove');

    return {
      ok: written.ok,
      record: written.ok ? removed : null,
      reason: written.reason,
      message: written.ok ? '' : written.message
    };
  }

  function clear() {
    var records = readAll();

    storage.remove(KEY);
    storage.remove(NOTES_KEY);
    notify('clear', records);

    return records.length;
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('storage', function (event) {
      if (event.key !== storage.prefix + KEY) {
        return;
      }

      notify('external', readAll());
    });
  }

  global.MindForgeHistory = Object.freeze({
    all: all,
    get: get,
    save: save,
    updateProgress: updateProgress,
    remove: remove,
    clear: clear,
    getIssues: function () {
      return issues.slice();
    },
    storageKey: storage.prefix + KEY,
    notesKey: storage.prefix + NOTES_KEY,
    backupKey: storage.prefix + BACKUP_KEY,
    schemaVersion: SCHEMA_VERSION,
    limit: LIMIT,
    isPersistent: storage.isPersistent
  });
})(window);
