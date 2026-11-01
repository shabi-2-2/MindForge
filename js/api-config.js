/**
 * MindForge API configuration
 * Central place for backend URL configuration.
 *
 * In local development (localhost / 127.0.0.1), this automatically defaults
 * to http://127.0.0.1:8000.
 *
 * In production (e.g. deployed to Vercel), set the Render backend URL in
 * js/config.js (window.MINDFORGE_CONFIG.apiBaseUrl = 'https://<your-render-service>.onrender.com')
 * or configure PRODUCTION_API_BASE_URL below.
 *
 * Rule: The deployed production site will NEVER make requests to localhost.
 */
(function (global) {
  'use strict';

  var DEFAULT_LOCAL_API_BASE_URL = 'http://127.0.0.1:8000';
  var PRODUCTION_API_BASE_URL = '';

  function isLoopbackHost(hostname) {
    if (!hostname) {
      return true; // Node.js test environment or local runner without host
    }
    var host = String(hostname).toLowerCase().split(':')[0];
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '[::1]' ||
      host === '0.0.0.0' ||
      host.endsWith('.local')
    );
  }

  function isLocalEnvironment() {
    try {
      if (typeof global.location === 'undefined' || !global.location) {
        return true; // Node.js / unit test runner
      }
      if (global.location.protocol === 'file:') {
        return true;
      }
      return isLoopbackHost(global.location.hostname);
    } catch (error) {
      return true;
    }
  }

  function isLoopbackUrl(url) {
    if (!url || typeof url !== 'string') {
      return false;
    }
    var trimmed = url.trim().toLowerCase();
    return (
      trimmed.indexOf('localhost') !== -1 ||
      trimmed.indexOf('127.0.0.1') !== -1 ||
      trimmed.indexOf('[::1]') !== -1 ||
      trimmed.indexOf('0.0.0.0') !== -1
    );
  }

  function getConfiguredProductionUrl() {
    // 1. Check window.MINDFORGE_CONFIG.apiBaseUrl
    try {
      if (
        global.MINDFORGE_CONFIG &&
        typeof global.MINDFORGE_CONFIG.apiBaseUrl === 'string' &&
        global.MINDFORGE_CONFIG.apiBaseUrl.trim()
      ) {
        return global.MINDFORGE_CONFIG.apiBaseUrl.trim();
      }
    } catch (e) {
      // Ignore config errors
    }

    // 2. Fallback to PRODUCTION_API_BASE_URL constant
    if (typeof PRODUCTION_API_BASE_URL === 'string' && PRODUCTION_API_BASE_URL.trim()) {
      return PRODUCTION_API_BASE_URL.trim();
    }

    return '';
  }

  function getApiBaseUrl() {
    var isLocal = isLocalEnvironment();

    // Check localStorage override
    var override = null;
    try {
      var raw = localStorage.getItem('mindforge:apiBaseUrl');
      if (raw && typeof raw === 'string' && raw.trim()) {
        override = raw.trim();
      }
    } catch (error) {
      // Ignore localStorage errors
    }

    if (isLocal) {
      // In local development, use localStorage override if set, else local default
      if (override) {
        return override.replace(/\/+$/, '');
      }
      return DEFAULT_LOCAL_API_BASE_URL;
    }

    // In production (deployed site on Vercel or custom domain):
    // Rule: NEVER make a request to localhost from the deployed production site!
    if (override && !isLoopbackUrl(override)) {
      return override.replace(/\/+$/, '');
    }

    var prodUrl = getConfiguredProductionUrl();
    if (prodUrl && !isLoopbackUrl(prodUrl)) {
      return prodUrl.replace(/\/+$/, '');
    }

    // If running in production and no public production URL has been configured,
    // return an empty string so callers can fail cleanly rather than hitting localhost.
    return '';
  }

  function setApiBaseUrl(url) {
    try {
      if (url && typeof url === 'string') {
        localStorage.setItem('mindforge:apiBaseUrl', url.trim());
      } else {
        localStorage.removeItem('mindforge:apiBaseUrl');
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  }

  global.MindForgeApiConfig = Object.freeze({
    getApiBaseUrl: getApiBaseUrl,
    setApiBaseUrl: setApiBaseUrl,
    isLocalEnvironment: isLocalEnvironment,
    isLoopbackUrl: isLoopbackUrl,
    DEFAULT_API_BASE_URL: DEFAULT_LOCAL_API_BASE_URL,
    DEFAULT_LOCAL_API_BASE_URL: DEFAULT_LOCAL_API_BASE_URL,
    PRODUCTION_API_BASE_URL: PRODUCTION_API_BASE_URL
  });
})(typeof window !== 'undefined' ? window : this);
