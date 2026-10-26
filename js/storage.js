/**
 * MindForge storage utility
 * A tiny, defensive wrapper around localStorage. Falls back to an in-memory
 * store when storage is unavailable (private mode, blocked cookies, etc.).
 */
(function (global) {
  'use strict';

  var PREFIX = 'mindforge:';
  var memory = Object.create(null);
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

  function read(key, fallback) {
    var raw;

    try {
      raw = storageAvailable ? global.localStorage.getItem(PREFIX + key) : memory[key];
    } catch (error) {
      raw = memory[key];
    }

    if (raw === null || raw === undefined) {
      return fallback;
    }

    try {
      return JSON.parse(raw);
    } catch (error) {
      return raw;
    }
  }

  function write(key, value) {
    var raw = serialise(value);

    if (raw === null) {
      return false;
    }

    memory[key] = raw;

    if (!storageAvailable) {
      return false;
    }

    try {
      global.localStorage.setItem(PREFIX + key, raw);
      return true;
    } catch (error) {
      return false;
    }
  }

  function remove(key) {
    delete memory[key];

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
    set: write,
    remove: remove,
    prefix: PREFIX,
    isPersistent: storageAvailable
  });
})(window);
