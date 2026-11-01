# MindForge Deployment Guide (Vercel + Render)

This guide walks through deploying MindForge to production with:
- **Frontend**: Hosted on [Vercel](https://vercel.com) as a static site (HTML, CSS, JavaScript).
- **Backend**: Hosted on [Render](https://render.com) as a Python Web Service (FastAPI + Google Gemini).

```
┌─────────────────────────┐               ┌───────────────────────────────┐
│     Vercel Frontend     │  POST /api/*  │        Render Backend         │
│  https://<app>.vercel.app│ ─────────────>│ https://<service>.onrender.com│
└─────────────────────────┘               └──────────────┬────────────────┘
                                                         │ Gemini API
                                                         ▼
                                          ┌───────────────────────────────┐
                                          │       Google AI Studio        │
                                          │      gemini-3.6-flash         │
                                          └───────────────────────────────┘
```

---

## Architecture & Security Principles

1. **Zero Secret Exposure**: The `GEMINI_API_KEY` is configured **only** on Render as a server environment variable. It is **never** added to frontend code, `js/config.js`, Vercel variables, or committed Git files.
2. **Localhost Protection**: The frontend automatically checks its environment. A deployed production site will **never** fall back or send requests to `localhost`.
3. **Strict CORS**: The backend only accepts cross-origin requests from the exact configured production Vercel origin (`CORS_ORIGINS`) and approved preview domains. No wildcards (`*`) with credentials.
4. **Vanilla Simplicity**: No frontend build step or framework required. The static files are served directly.

---

## Part 1: Deploy Backend on Render

### Step 1.1: Create Web Service on Render

1. Log in to [Render](https://dashboard.render.com).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub repository containing MindForge.
4. Configure the service settings:

| Setting | Value | Notes |
| --- | --- | --- |
| **Name** | `mindforge-api` (or preferred name) | Determines your URL: `https://<name>.onrender.com` |
| **Region** | Choose closest to your users | e.g. Oregon (US West) or Frankfurt (EU) |
| **Branch** | `main` | Production branch |
| **Root Directory** | `backend` | **Important**: Tells Render to run from `backend/` |
| **Runtime** | `Python` | Python 3.13 is specified via `backend/.python-version` |
| **Build Command** | `pip install -r requirements.txt` | Installs FastAPI, Uvicorn, google-genai, etc. |
| **Start Command** | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` | Binds to Render's assigned port |
| **Health Check Path** | `/api/health` | Verifies health before marking deployment live |
| **Plan** | Free (or Starter) | Free tier spins down after inactivity (see notes below) |

> **Alternative (Render Blueprint)**: You can also deploy via the included `render.yaml` blueprint using **New +** → **Blueprint**.

### Step 1.2: Set Environment Variables on Render

In the **Environment** tab of your Render service, add the following variables:

| Key | Value / Example | Required | Notes |
| --- | --- | --- | --- |
| `PYTHON_VERSION` | `3.13.0` | Yes | Ensures Python 3.13 runtime |
| `GEMINI_API_KEY` | `your-secret-gemini-key` | Yes | From [Google AI Studio](https://aistudio.google.com/apikey). Keep secret! |
| `GEMINI_MODEL` | `gemini-3.6-flash` | Yes | Supported model for study material generation |
| `CORS_ORIGINS` | `https://<your-vercel-app>.vercel.app` | Yes | Your Vercel domain (placeholder until Vercel URL is known) |
| `APP_NAME` | `MindForge API` | Optional | Default: `MindForge API` |
| `API_PREFIX` | `/api` | Optional | Default: `/api` |
| `GEMINI_TIMEOUT_SECONDS` | `45` | Optional | Per-request timeout (1–120s) |
| `GEMINI_MAX_RETRIES` | `2` | Optional | Transient retry attempts (0–3) |

> **Tip**: If you know your final Vercel domain (e.g. `https://mindforge-app.vercel.app`), enter it now. If not, use a temporary placeholder like `https://temp.vercel.app` and update it after creating the Vercel project in Part 2.

### Step 1.3: Verify Backend Deployment

Once Render finishes deploying:

1. Test the health endpoint:
   ```bash
   curl -i https://<your-render-service>.onrender.com/api/health
   ```
   Expected response: `HTTP/2 200`
   ```json
   {"status":"ok","service":"MindForge API"}
   ```

2. Test generation directly:
   ```bash
   curl -X POST https://<your-render-service>.onrender.com/api/generate \
     -H 'Content-Type: application/json' \
     -d '{
       "topic": "Photosynthesis",
       "notes": "Chlorophyll absorbs light energy to convert carbon dioxide and water into glucose and oxygen.",
       "answerStyle": "exam",
       "difficulty": "medium"
     }'
   ```
   Expected response: `HTTP/2 200` with JSON containing `summary`, `quiz` (5 questions), and `flashcards`.

---

## Part 2: Deploy Frontend on Vercel

### Step 2.1: Configure Frontend API Base URL

In `js/config.js`, set your public Render URL:

```javascript
window.MINDFORGE_CONFIG = Object.freeze({
  // Replace with your real Render web service URL:
  apiBaseUrl: 'https://<your-render-service>.onrender.com'
});
```

*Note: For local development, leaving `apiBaseUrl` empty (`''`) causes the frontend to automatically connect to `http://127.0.0.1:8000`.*

### Step 2.2: Import Project on Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** → **Project**.
3. Import your GitHub repository.
4. Configure Project Settings:
   - **Framework Preset**: `Other` (static site)
   - **Root Directory**: `./` (leave default repository root)
   - **Build Command**: Leave empty / disabled (no build step needed)
   - **Output Directory**: Leave empty / disabled
5. Click **Deploy**.

Vercel will serve `index.html`, `css/`, `js/`, and `assets/` statically. The included `vercel.json` applies security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`).

### Step 2.3: Note Your Production Vercel Domain

Upon deployment, Vercel assigns your project a domain, e.g.:
`https://<your-project-name>.vercel.app`

---

## Part 3: Synchronize CORS and Final Testing

### Step 3.1: Update `CORS_ORIGINS` on Render

1. Go to your Render Dashboard → Select your service → **Environment**.
2. Update `CORS_ORIGINS` with your exact Vercel production origin:
   ```env
   CORS_ORIGINS=https://<your-project-name>.vercel.app
   ```
3. If you also want to develop locally against your live Render service or test with Live Server:
   ```env
   CORS_ORIGINS=https://<your-project-name>.vercel.app,http://localhost:5500,http://127.0.0.1:5500
   ```
4. Save Changes. Render will automatically redeploy the service with the new environment variables.

### Step 3.2: Verify Vercel Frontend End-to-End

1. Open your Vercel URL in a browser: `https://<your-project-name>.vercel.app`.
2. Open Browser DevTools (Console and Network tabs).
3. Navigate to **Study Workspace**.
4. Enter a topic (e.g. `Cell Division`) and paste short notes.
5. Click **Generate study material**.
6. Verify:
   - Summary, 5-question Quiz, and Flashcards render successfully.
   - In the Network tab, the POST request went to `https://<your-render-service>.onrender.com/api/generate` with status `200 OK`.
   - Response headers include `access-control-allow-origin: https://<your-project-name>.vercel.app`.
   - Completed session is saved to browser **History**.

---

## Preview Deployments (Optional)

If using Vercel preview branches (pull requests) and you want them to communicate with the Render backend:
- Add the preview URL to `CORS_ORIGINS` on Render, **OR**
- Configure `CORS_ORIGIN_REGEX` on Render to match your Vercel preview subdomains without allowing arbitrary third-party origins:
  ```env
  CORS_ORIGIN_REGEX=^https://<your-vercel-project>-[a-z0-9-]+\.vercel\.app$
  ```

---

## Troubleshooting Guide

| Issue | Root Cause | Solution |
| --- | --- | --- |
| **CORS Error** (`Access to fetch at ... blocked by CORS policy`) | Frontend origin does not match `CORS_ORIGINS` on Render. | Check the `Origin` header in the browser console. Add the exact origin (including `https://` and no trailing slash) to `CORS_ORIGINS` in Render environment settings, then redeploy. |
| **503 configuration_error: Gemini is not configured** | `GEMINI_API_KEY` or `GEMINI_MODEL` is missing in Render environment variables. | In Render Dashboard → Environment, ensure `GEMINI_API_KEY` has a valid key and `GEMINI_MODEL=gemini-3.6-flash`. |
| **502 provider_auth_error: Gemini rejected the server's API key** | The API key in Render is invalid, revoked, or has leading/trailing whitespace. | Verify the key at [Google AI Studio](https://aistudio.google.com/apikey). Re-enter it in Render environment variables without spaces. |
| **429 provider_rate_limited** | Gemini API free quota exceeded or rate limit reached. | Wait a few moments before trying again, or check your quota / billing in Google Cloud / AI Studio. |
| **Render Free Tier Spin-Down (Cold Start)** | Render's free tier spins down web services after 15 minutes of inactivity. First request may take 30–50 seconds. | Wait for the initial request to complete. Consider upgrading to Render Starter or using an external uptime monitor (e.g., UptimeRobot) if instant response is critical. |
| **"Production backend API URL is not configured"** | `js/config.js` still has `apiBaseUrl: ''` on the deployed Vercel site. | Update `js/config.js` with your Render backend URL, or use devtools `localStorage.setItem('mindforge:apiBaseUrl', 'https://<your-service>.onrender.com')`. |
| **"Cannot make requests to localhost from a deployed production site"** | The frontend on Vercel is attempting to connect to `127.0.0.1` or `localhost`. | Ensure `js/config.js` points to your public Render URL (`https://...onrender.com`), not localhost. |
