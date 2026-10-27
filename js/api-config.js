/**
 * MindForge API configuration
 * Central place for backend URL configuration
 */
(function (global) {
  'use strict';

  var API_BASE_URL = 'http://127.0.0.1:8000';

  function getApiBaseUrl() {
    // Allow override via localStorage for different environments
    try {
      var override = localStorage.getItem('mindforge:apiBaseUrl');
      if (override) {
        return override;
      }
    } catch (error) {
      // Ignore localStorage errors
    }
    return API_BASE_URL;
  }

  function setApiBaseUrl(url) {
    try {
      localStorage.setItem('mindforge:apiBaseUrl', url);
    } catch (error) {
      // Ignore localStorage errors
    }
  }

  global.MindForgeApiConfig = Object.freeze({
    getApiBaseUrl: getApiBaseUrl,
    setApiBaseUrl: setApiBaseUrl,
    DEFAULT_API_BASE_URL: API_BASE_URL
  });
})(window);
