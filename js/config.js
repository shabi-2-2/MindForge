/**
 * MindForge Public Runtime Configuration
 *
 * This file is loaded by index.html in the browser.
 *
 * Local development:
 *   Leave apiBaseUrl as '' (empty string). MindForge will automatically
 *   connect to the local FastAPI backend at http://127.0.0.1:8000.
 *
 * Production (Vercel deployment):
 *   Set apiBaseUrl to your public Render service URL:
 *   apiBaseUrl: 'https://<your-render-service>.onrender.com'
 *
 * Security note:
 *   Never put secret keys (such as GEMINI_API_KEY) in this file.
 *   The Gemini API key belongs exclusively in the Render backend environment.
 */
(function (global) {
  'use strict';

  global.MINDFORGE_CONFIG = Object.freeze({
    // Production Render backend base URL
    apiBaseUrl: 'https://mindforge-api-85fh.onrender.com'
  });
})(typeof window !== 'undefined' ? window : this);
