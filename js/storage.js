/**
 * MindForge storage utility
 * A tiny, defensive wrapper around localStorage. Falls back to an in-memory
 * store when storage is unavailable (private mode, blocked cookies, etc.).
 *
 * Detailed reads distinguish "missing" from "present but corrupt" so callers
 * can preserve user data instead of silently replacing it. Detailed writes
 * report quota exhaustion separately from other storage failures.
 */
(function (global) {
  'use strict';

  var PREFIX = 'mindforge:';
  var memory = Object.create(null);
  var memoryOnly = Object.create(null);
  var storageAvailable = (function () {
    try {
      var probe = PREFIX + '__probe__';
      global.localStorage.setItem(probe, '1');
      global.localStorage.removeItem(probe);
      return true;
    } catch (error) {
      return false;
    }
  })();

  function serialise(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return null;
    }
  }

  function classifyError(error) {
    var name = error && error.name ? String(error.name) : '';
    var message = error && error.message ? String(error.message) : '';

    if (
      name === 'QuotaExceededError' ||
      name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      /quota|storage full/i.test(message)
    ) {
      return 'quota';
    }

    return 'unavailable';
  }

  function currentRaw(key) {
    if (memoryOnly[key]) {
      return memory[key];
    }

    try {
      return storageAvailable
        ? global.localStorage.getItem(PREFIX + key)
        : memory[key];
    } catch (error) {
      return memory[key];
    }
  }

  function readDetailed(key, fallback) {
    var raw = currentRaw(key);

    if (raw === null || raw === undefined) {
      return {
        value: fallback,
        found: false,
        corrupt: false,
        raw: null
      };
    }

    try {
      return {
        value: JSON.parse(raw),
        found: true,
        corrupt: false,
        raw: raw
      };
    } catch (error) {
      return {
        value: fallback,
        found: true,
        corrupt: true,
        raw: raw
      };
    }
  }

  function read(key, fallback) {
    return readDetailed(key, fallback).value;
  }

  function writeDetailed(key, value) {
    var raw = serialise(value);

    if (raw === null) {
      return { ok: false, reason: 'serialise' };
    }

    memory[key] = raw;
    memoryOnly[key] = true;

    if (!storageAvailable) {
      return { ok: false, reason: 'unavailable' };
    }

    try {
      global.localStorage.setItem(PREFIX + key, raw);
      memoryOnly[key] = false;
      return { ok: true, reason: '' };
    } catch (error) {
      return { ok: false, reason: classifyError(error) };
    }
  }

  function write(key, value) {
    return writeDetailed(key, value).ok;
  }

  function setRaw(key, raw) {
    if (typeof raw !== 'string') {
      return false;
    }

    memory[key] = raw;
    memoryOnly[key] = true;

    if (!storageAvailable) {
      return false;
    }

    try {
      global.localStorage.setItem(PREFIX + key, raw);
      memoryOnly[key] = false;
      return true;
    } catch (error) {
      return false;
    }
  }

  function remove(key) {
    delete memory[key];
    delete memoryOnly[key];

    if (!storageAvailable) {
      return;
    }

    try {
      global.localStorage.removeItem(PREFIX + key);
    } catch (error) {
      /* Storage can be revoked at any time; failing quietly is intentional. */
    }
  }

  global.MindForgeStorage = Object.freeze({
    get: read,
    getDetailed: readDetailed,
    set: write,
    setDetailed: writeDetailed,
    setRaw: setRaw,
    remove: remove,
    prefix: PREFIX,
    isPersistent: storageAvailable
  });
})(window);
