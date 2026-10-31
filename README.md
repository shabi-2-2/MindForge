# MindForge

**Shape the way you learn.**

A premium study workspace for deliberate learning. Phase 0 delivered the dashboard foundation — visual system, navigation, theme persistence, study statistics, recent sessions and activity visualisation. Part 2 added the Study Workspace and local mock generation. Part 3 made the generated material interactive: a readable summary, a five-question scored quiz, flip flashcards, saved generations and progress derived from your own answers. Phase 1 hardened that workflow with explicit generation states, configurable input limits and runtime response validation. Phase 2 moved generation behind a FastAPI backend. **Phase 3.1 replaced the backend mock with real server-side Google Gemini generation**, and **Phase 3.2 improves prompt quality, adds semantic quality gates and one bounded repair attempt**, while keeping the existing API and frontend contract. **Phase 4 hardens browser-local persistence and History** with versioned schemas, data-safe migration, note de-duplication, search and filters, and analytics derived only from saved records.

The frontend is still plain HTML, CSS and vanilla JavaScript with no framework and no build step. The browser calls only the MindForge FastAPI backend; the API key and Gemini calls stay on the server.

## Run it

You need Python 3.11+ and a Gemini API key. Run the backend and frontend separately.

### 1. Get a Gemini API key

1. Open [Google AI Studio](https://aistudio.google.com/apikey) and sign in with a Google account.
2. Click **Create API key** and choose or create a project.
3. Copy the key. Treat it like a password: it belongs in `backend/.env`, never in source code, chat, Git or the browser.

The key is read only by the backend from `GEMINI_API_KEY`. The model is configured separately with `GEMINI_MODEL`; use a currently supported model from the [Gemini model list](https://ai.google.dev/gemini-api/docs/models). The example uses `gemini-3.6-flash`, but you can change it without code changes.

### 2. Backend (FastAPI + Gemini)

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment (macOS/Linux):
```bash
python3 -m venv .venv
source .venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create your local environment file:
```bash
cp .env.example .env
```

5. Edit `backend/.env` and set at least:
```dotenv
GEMINI_API_KEY=your-real-key-from-ai-studio
GEMINI_MODEL=gemini-3.6-flash
```

   Optional settings:

   | Variable | Default | Purpose |
   | --- | --- | --- |
   | `GEMINI_TIMEOUT_SECONDS` | `45` | Per-request timeout, bounded to 1–120 seconds. |
   | `GEMINI_MAX_RETRIES` | `2` | Extra attempts for transient timeouts, network failures and provider 5xx errors, bounded to 0–3. Authentication failures, rate limits and validation failures are never retried. |
   | `CORS_ORIGINS` | local origins | Comma-separated frontend origins allowed to call the API. |
   | `CORS_ORIGIN_REGEX` | loopback pattern | Optional pattern that allows `localhost`, `127.0.0.1` and `[::1]` on any port. Set it to an empty value to disable it. |

   `backend/.env` is ignored by Git. Never commit it or paste its contents anywhere public.

6. Start the backend:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend API is at <http://127.0.0.1:8000>, interactive docs at <http://127.0.0.1:8000/docs>, and the health check at <http://127.0.0.1:8000/api/health>.

### 3. Frontend

Serve the repository root (not the `backend` folder) with a static server. Loopback origins on any port are allowed by default, so Live Server works whether it uses 5500 or the next free port. Non-loopback origins must be added explicitly to `CORS_ORIGINS`.

Using Python:
```bash
python3 -m http.server 5500
```

Or use the VS Code **Live Server** extension and open `index.html` from the repository root. Live Server normally uses port 5500, but it increments to 5501, 5502, and so on when that port is busy; the default loopback CORS pattern covers those ports.

Visit <http://localhost:5500>. Do not open `index.html` directly with `file://` if you want API generation, History and clipboard features to behave consistently.

### 4. Test generation

In the Study Workspace:

1. Enter a topic such as `Photosynthesis`.
2. Paste at least a few sentences of notes.
3. Choose an answer style and difficulty.
4. Choose **Generate study material**.

The button is disabled and a loading indicator appears while the backend calls Gemini. On success, the Summary, Quiz and Flashcards tabs render, and the session is saved to History. On failure, the UI shows a safe, actionable message and keeps your notes; Retry is offered only for recoverable failures such as timeouts or rate limits.

You can also test the API directly:

```bash
curl -X POST http://127.0.0.1:8000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{
    "topic": "Photosynthesis",
    "notes": "Plants use sunlight, carbon dioxide and water to produce glucose and oxygen.",
    "answerStyle": "exam",
    "difficulty": "medium"
  }'
```

A successful response has exactly five quiz questions and follows the existing contract:

```json
{
  "summary": { "text": "...", "keyConcepts": ["..."] },
  "quiz": [
    {
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "correctAnswer": 0,
      "explanation": "..."
    }
  ],
  "flashcards": [{ "front": "...", "back": "..." }]
}
```

### Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `503 configuration_error` mentioning `GEMINI_API_KEY` | `backend/.env` is missing the key, or the server was started before the file was created. Add the key and restart uvicorn. |
| `503 configuration_error` mentioning `GEMINI_MODEL` | Set `GEMINI_MODEL` to a currently supported model ID, then restart uvicorn. |
| `502 provider_auth_error` | Gemini rejected the key. Check for extra spaces or a revoked/restricted key in AI Studio, update `GEMINI_API_KEY`, and restart. |
| `429 provider_rate_limited` | You hit a rate limit or exhausted the free-tier quota. Wait, check usage in AI Studio, or enable billing/raise the quota. The backend does not retry this automatically. |
| `504 provider_timeout` or `502 provider_unavailable` | The network is slow or blocked. Check the server's connection, try again, or raise `GEMINI_TIMEOUT_SECONDS` carefully. |
| `502 invalid_provider_response` | Gemini returned unreadable, truncated, structurally invalid or semantically weak study material, and the single repair attempt also failed. Try again; if it repeats, check that `GEMINI_MODEL` supports JSON structured output. |
| Browser shows `OPTIONS /api/generate 400` or a CORS error | The frontend origin is not allowed. Loopback origins (`localhost`, `127.0.0.1`, `[::1]`) on any port are allowed by default. If you use a different host or a `file://` page, serve the UI from a loopback origin or add the exact origin to `CORS_ORIGINS`, then restart uvicorn. Review `CORS_ORIGINS` / `CORS_ORIGIN_REGEX` in `backend/app/config.py`. |
| Browser shows `Unable to reach the backend` | FastAPI is not running on port 8000, or `js/api-config.js` points elsewhere. Start the backend and check that requests go to `http://127.0.0.1:8000/api/generate`. |
| `GET /health` returns 404 | Expected: only `GET /api/health` is defined. Use `http://127.0.0.1:8000/api/health`. |
| Generation works but History does not save | Browser storage is blocked or full. The result still renders and stays available for this tab; allow site data or delete a saved session, then try again. Quota failures are reported without crashing the app. |
| History shows fewer sessions than expected | Some records were unreadable. MindForge preserves the raw payload in `mindforge:generations:backup` and shows a notice instead of silently replacing your data. Inspect that key before clearing it. |

Never commit `.env`. If a key is accidentally exposed, revoke it in Google AI Studio and create a new one.

## What is included

- **Premium dashboard** with a welcome panel, daily focus dial, four derived statistics, recent sessions, a seven-day activity chart and a weekly goal ring.
- **Working study workspace** with topic and notes fields, live character counters, near-limit warnings, answer-style and quiz-difficulty choices, inline validation, duplicate-submission protection, explicit `idle`/`loading`/`success`/`error` states, stale-response guards and recoverable retry.
- **Server-side Gemini generation** that sends the topic, notes, answer style and difficulty to FastAPI, asks Gemini for structured JSON, validates it against the study contract and returns only safe study material. The browser never receives the API key and never calls Gemini directly.
- **Validated generation contract** that trims and checks the request before generation, rejects malformed provider responses at runtime, and migrates Phase 0 history records to the current shape when they are read.
- **Interactive result tabs** for Summary, Quiz and Flashcards, with arrow-key, Home and End keyboard navigation.
- **Summary actions** that copy the summary and key concepts through the Clipboard API (with a legacy copy fallback) and download the same content as a `.txt` file.
- **Scored retrieval quiz** with dynamic options, one-shot scoring, correct/incorrect feedback, the correct answer, an explanation, a running score, a final percentage and a working Restart action.
- **Flip flashcards** with accessible Known / Not known controls and a live mastered count. The flip is a 3D transform that respects `prefers-reduced-motion`.
- **Saved generations** in History. Every completed generation is saved automatically with a stable ID and timestamps, can be reopened with its quiz answers and card progress restored, and can be deleted individually after confirmation. History is newest-first and supports live search plus difficulty, answer-style and progress filters.
- **Durable local history** with an explicit schema version, automatic migration of older unversioned records, duplicate-ID protection, content-addressed notes stored once, and corruption/quota handling that preserves raw data instead of silently replacing it.
- **Live analytics derived only from saved records**: sessions, focus minutes, quiz attempts and completion, average score, questions answered, known and reviewed cards, topic history, a 14-day activity chart, a consecutive-day streak and per-session summaries. Zero and missing data render honest empty states rather than invented streaks or mastery.
- **Single-page navigation** across Dashboard, Study Workspace, History, Progress and Settings. The active section is highlighted, the URL hash is deep-linkable, and each view moves focus to its heading.
- **Persistent theme** with a light/dark toggle in the top bar and matching controls in Settings. The choice is saved to `localStorage` under `mindforge:theme`; with no saved choice, MindForge follows the OS preference. Theme changes are mirrored between tabs.
- **Responsive sidebar** that becomes a keyboard-accessible off-canvas drawer below 1140px, with a scrim, focus trap, Escape-to-close and a working mobile menu button.
- **Realistic dashboard fixtures** for the user profile and weekly goal only. Every statistic, session list, activity bar and progress figure is now derived from saved records.
- **Accessibility basics**: semantic landmarks, skip link, visible focus indicators, `aria-current` navigation, labelled icon buttons, inline `aria-invalid` field errors, tab and radio semantics, live-region feedback and `prefers-reduced-motion` support.
- **Design tokens** for colour, spacing, borders, radii, shadows and typography, with full light and dark palettes.

## Study Workspace

The workspace form asks for a topic and notes, plus two choices:

| Field | Rules |
| --- | --- |
| Topic | Required after trimming. Maximum 120 characters. |
| Notes | Required after trimming. Maximum 20,000 characters. |
| Answer style | Explain Like I'm 10 · Exam-Focused · Detailed. Sets the summary tone and the generation instructions. |
| Quiz difficulty | Easy · Medium · Hard. Every quiz has five questions. Difficulty changes question depth and the requested flashcard count (4, 5 or 6). |

Whitespace-only values are rejected. Content is never silently truncated: over-limit input stays in the field, the counter switches to an over-limit state and generation is blocked with an explicit error. From 90% of a limit, the counter warns and shows how many characters remain. Limits are configurable at runtime:

```js
MindForgeContract.getLimits(); // { topic: 120, notes: 20000 }
MindForgeContract.configure({ topic: 160, notes: 30000 });
```

Submitting the form:

1. Validates both fields, both settings and the configured limits, then focuses the first problem. Invalid requests never reach the provider.
2. Moves the form from `idle` to `loading`: disables the button, sets `aria-busy`, and shows a loading indicator plus live status text. Rapid duplicate submissions are ignored.
3. On success, moves to `success`, saves the result to History and renders the interactive result below the form. Every response is validated before saving or rendering.
4. On failure, moves to `error`, restores the form, keeps the inputs and the previous result visible, moves focus to an alert, and exposes a Retry action for recoverable failures. Non-recoverable failures such as an invalid response or invalid request do not offer retry.
5. Uses a request sequence so a stale response cannot overwrite a newer generation or a record reopened from History.

The generated result is available through `window.MindForgeWorkspace.getLastResult()` and the `mindforge:studymaterialready` document event. Its contract shape is:

```js
{
  id, createdAt, topic, notes,
  config: { answerStyle, answerStyleLabel, difficulty, difficultyLabel },
  summary: {
    text,                       // non-empty string
    keyConcepts,                // non-empty array of non-empty strings
    title, estimatedMinutes     // optional extras retained for the UI
  },
  quiz: [{                      // exactly five items
    id,
    question,                   // non-empty string
    options,                    // exactly four non-empty strings
    correctAnswer,              // integer 0–3
    explanation                 // non-empty string
  }],
  flashcards: [{ id, front, back }], // non-empty array of non-empty pairs
  meta: { generator, version, characters: { topic, notes } }
}
```

Saved records add `progress`, `savedAt` and `updatedAt`:

```js
{
  progress: {
    quiz: { answers: { [questionId]: optionIndex } },
    flashcards: {
      known: [cardId],    // marked known
      reviewed: [cardId]  // shown or answered at least once
    }
  },
  savedAt, updatedAt
}
```

When the record is written, the `notes` field is replaced by a content-addressed `notesRef` and stored once in `mindforge:notes`. Reads hydrate `notes` back onto the record, so consumers do not need to know about the split. Records are deduplicated by `id`; saving the same session again updates that record instead of appending a duplicate.

The generator is accessed through one frontend interface:

```js
MindForgeGeneration.generate({ topic, notes, answerStyle, difficulty });
```

It validates the request, calls `POST /api/generate` on the FastAPI backend and validates the response before it can be saved or rendered. The backend performs the Gemini call; the browser has no Gemini credentials. The previous local mock remains in the repository only as a test fixture and explicit `setProvider` option, never as an automatic fallback:

```js
MindForgeGeneration.getProviderName(); // "api-backend"
MindForgeGeneration.setProvider(providerFunction, 'my-provider'); // explicit test double
MindForgeGeneration.resetProvider();
```

### Gemini request flow

1. `js/workspace.js` validates the form and calls `MindForgeGeneration.generate`.
2. `js/generation.js` posts `{ topic, notes, answerStyle, difficulty }` to `POST /api/generate` and checks `response.ok`.
3. `backend/app/main.py` validates the request with Pydantic and calls `GeminiGenerationService`.
4. `backend/app/services/generation.py` reads `GEMINI_API_KEY` and `GEMINI_MODEL` from the server environment, builds a prompt that treats the notes as the primary source and untrusted study material, and calls Gemini's Interactions API with a JSON response schema.
5. Gemini's output is parsed as JSON, validated with `GenerateResponse`, then checked by `backend/app/services/quality.py` for non-empty/meaningful content, exactly five distinct questions, duplicate questions/cards/options and thin explanations or summaries.
6. If the first response is malformed, truncated or fails a quality check, the service makes **one** bounded repair request. The repair repeats the original task and notes without echoing the invalid output. There is no repair loop and no mock fallback.
7. Only validated study material is returned. Provider failures map to safe HTTP errors; raw provider details, notes and keys are never returned.
8. The frontend re-validates the payload against the runtime contract, renders it and saves it to History.

### Validation and diagnostics

- Request validation returns per-field errors (`required`, `too-long`, `invalid-setting`) and trimmed values.
- Response validation checks summary text and concepts, exactly five quiz questions, four non-empty options each, strict integer `correctAnswer` values from 0 through 3 (booleans and numeric strings are rejected), non-empty explanations, and non-empty flashcards with both faces.
- Semantic quality checks require a substantive summary (at least 40 characters), 3–10 distinct key concepts, 3–12 distinct flashcards, question text and explanations above a minimum length, no duplicate options, and no duplicate or near-duplicate question stems or flashcard fronts.
- Invalid, truncated, empty, over/under-counted or semantically weak responses trigger at most one repair attempt. If repair also fails, the API returns a safe `502 invalid_provider_response`; partial output is never rendered or saved. The frontend shows this as an unusable-result error with a retry, distinct from a network outage.
- Invalid responses surface a plain-language error and are never saved or partially rendered. Safe diagnostics (error paths/codes and the received top-level shape) are retained in `MindForgeWorkspace.getLastDiagnostics()`; raw provider errors and note contents are not exposed.
- Legacy Phase 0 records (`summary.overview`/`keyPoints`, `quiz.questions[].prompt`/`answerIndex`) are migrated to the current contract when History reads them.

> Schema and semantic validation check structure and repetition, not factual truth. They cannot prove that every question has exactly one defensible answer; the prompt instructs Gemini to achieve that, and a human review remains the reliable way to verify facts.

## How the interactive result works

- **Summary** renders the generated summary text and key concepts as text nodes (never as HTML). Copy writes a plain-text version, including the title and key concepts, to the clipboard. Download creates a Blob, triggers a temporary link and revokes the object URL.
- **Quiz** builds each question from the generated data. Selecting an option locks that question, reveals feedback and the correct answer, and scores it exactly once. The final panel shows `correct / total` and a percentage. Restart clears every answer and persists the clean state.
- **Flashcards** flip on click or keyboard activation. Known and Not known update `aria-pressed`, the card styling, the mastered count and the saved progress immediately. Long faces scroll inside the card rather than breaking the layout.
- **Tabs** use `role="tablist"`, `role="tab"` and `role="tabpanel"` with `aria-selected`, roving `tabindex` and arrow/Home/End navigation.

## Persistence

All app data stays in this browser profile. Nothing is uploaded to an account or synchronized between devices.

| Key | Contents |
| --- | --- |
| `mindforge:theme` | Light or dark preference. |
| `mindforge:generations` | Versioned envelope `{ version: 2, updatedAt, records }`. Up to 30 records, newest first. |
| `mindforge:notes` | Versioned, content-addressed note store. One copy per distinct notes text, referenced by `notesRef`. |
| `mindforge:generations:backup` | Up to three raw payloads that could not be parsed, kept so they can be recovered manually. |

### How saving works

- A successful generation receives a stable `id`, `createdAt`, `topic`, `notes`, `config` and `meta` before it is saved.
- Records are keyed by `id`. Saving the same session twice updates `updatedAt` but keeps the original `createdAt` and `savedAt`, so no duplicate history entry appears.
- Large notes are hashed and stored once. Removing the last record that references a note removes the note; unrelated notes are untouched.
- History is written newest-first. Opening a record restores its quiz answers and known/reviewed cards.
- Progress updates and deletions rewrite the history envelope and immediately refresh dashboard, History and Progress analytics.
- History updates are mirrored across tabs through the `storage` event.

### Migration and recovery

- Unversioned legacy arrays are migrated on read to the `version: 2` envelope without discarding records.
- Records from a newer schema version are left untouched and reported in the UI; MindForge does not overwrite data it does not understand.
- Invalid JSON, unexpected shapes and invalid records are copied to `mindforge:generations:backup` before being skipped, and a plain-language notice is shown. The original key is not silently replaced with an empty list.
- Invalid quiz answers and card IDs are dropped during normalisation; valid parts of the record are kept.
- When storage is blocked, MindForge uses an in-memory store for the current tab and explains that the session will disappear when the tab closes.
- When the quota is exhausted, saving fails with a clear message. The in-memory copy still lets the current tab continue, and the UI suggests deleting a saved session or clearing site data.

### Clearing data safely

To remove MindForge data, use the browser's site-data settings for the app's origin and delete only `mindforge:*` keys, or remove individual sessions with the History delete button. Avoid clearing all site data for unrelated origins. If you need to inspect a failed payload first, read `mindforge:generations:backup` in DevTools before deleting it.

Browser-local storage has hard limits and can be cleared by the browser, private-mode exit or OS cleanup. It is not a backup, is not encrypted by MindForge and is not shared across devices or browsers.

### Clipboard and downloads

Clipboard failures fall back to `document.execCommand('copy')`; if both fail, the UI explains that the summary must be copied manually. Download failures are reported in the same status line.

## Analytics rules

`js/analytics.js` is a pure module with no DOM or storage access. The dashboard, History and Progress views all read from it, so the same saved record is counted consistently.

| Measure | Rule |
| --- | --- |
| Sessions | One per saved record. |
| Focus minutes | Sum of each record's `summary.estimatedMinutes`; missing or invalid values count as 0. |
| Quiz attempt | A saved record with at least one valid, in-range answer. One attempt per record; repeated progress updates do not create extra attempts. |
| Quiz completed | A saved record where every quiz question has a valid answer. |
| Average score | Mean of started attempts. `null` when there are no attempts, so the UI shows `—` rather than a misleading `0%`. |
| Completed average | Mean of completed quizzes only. |
| Best score | Highest started-attempt percentage; `0` when none exist. |
| Questions answered | Valid answered questions across all saved records. |
| Known cards | Unique card IDs marked known in each record, summed across records. |
| Reviewed cards | Unique card IDs marked reviewed or known in each record, summed across records. |
| Topic count | Distinct `topic` values across saved records. |
| Activity | Focus minutes per day for the last 14 days, derived from record `createdAt`. |
| Streak | Consecutive calendar days ending today, or ending yesterday when nothing was saved today, that contain at least one saved record. |
| Week sessions | Records created in the last 7 calendar days. |

Sessions are only counted once. Because one attempt per record is currently tracked, restarting a quiz inside the same saved session replaces its answers rather than adding a second attempt. Historical attempt-by-attempt scoring is not stored.

When history is empty, all counts render as `0` or `—`, the activity chart shows an empty baseline and the streak reads `0` with a prompt to study today. No fixture sessions, mastery or streak are fabricated.

## Project structure

```text
MindForge/
├── index.html                    # App shell, all five views and the SVG icon sprite
├── assets/
│   └── favicon.svg               # Brand mark
├── css/
│   ├── styles.css                # Tokens, layout, components and motion
│   └── responsive.css            # Tablet, phone and drawer behaviour
├── js/
│   ├── api-config.js             # Backend base URL (browser never sees Gemini keys)
│   ├── analytics.js              # Pure record-based statistics, scoring, streak and filters
│   ├── app.js                    # Dashboard, History, Progress and filter/delete wiring
│   ├── generation.js             # Validated frontend interface to POST /api/generate
│   ├── history.js                # Versioned store, migration, note de-duplication and recovery
│   ├── learning.js               # Result tabs, quiz, flashcards, copy and download
│   ├── mock-data.js              # User profile and weekly-goal fixtures only
│   ├── mock-generator.js         # Test-only local provider, never an automatic fallback
│   ├── navigation.js             # Hash routing, focus management, mobile drawer
│   ├── storage.js                # Defensive localStorage wrapper with quota classification
│   ├── study-contract.js         # Configurable limits, request/response validation, migration
│   ├── theme.js                  # Theme persistence and cross-tab sync
│   └── workspace.js              # Form validation, state machine, generation and reopening
├── backend/
│   ├── app/
│   │   ├── config.py             # Environment and Gemini settings
│   │   ├── main.py               # FastAPI app, CORS, error mapping, /api endpoints
│   │   ├── schemas.py            # Pydantic request/response contract
│   │   └── services/
│   │       ├── generation.py     # Gemini client, prompt, retries, repair and validation
│   │       └── quality.py        # Semantic quality and duplicate-content checks
│   ├── tests/                    # Backend API and Gemini service tests (SDK mocked)
│   ├── .env.example              # Placeholders only; copy to .env
│   └── requirements.txt
├── tests/
│   ├── contract.test.mjs         # Frontend contract, generation metadata and migration tests
│   └── persistence.test.mjs      # Storage, schema, duplicate, filter and analytics tests
├── .gitignore
└── README.md
```

## Tests

### Backend

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

The backend suite mocks the Gemini SDK. It does not need a real API key, does not consume quota and makes no network requests. It covers:

- Valid Gemini output returned through `POST /api/generate`.
- Request parameters sent to Gemini, including the model, topic, notes, answer style, difficulty, system instruction and JSON schema.
- Exactly five validated quiz questions and schema violations, including missing fields, wrong types, boolean/string/float answer indices, wrong option counts and empty flashcards.
- Invalid JSON, truncated JSON, non-object JSON and empty provider responses.
- Successful repair after malformed output, and a failed repair that is capped at exactly one extra call.
- Semantic quality failures: short summaries/explanations, duplicate options, duplicate or near-duplicate questions and flashcards, and too few/many concepts or cards.
- Missing API key, missing/invalid model configuration.
- Provider authentication errors, rate limits/quota, timeouts, network failures and provider 5xx responses.
- Bounded retries for transient failures and no retries for authentication, rate limits or validation failures.
- Safe HTTP responses that do not leak keys, notes, provider messages or stack traces, and never substitute mock material.
- Preservation of the existing response schema.

### Frontend

The contract, generation service, persistence layer, migration and analytics are covered by Node's built-in test runner (Node 18+). No dependencies are required:

```bash
node --test tests/*.test.mjs
```

`tests/contract.test.mjs` covers valid and trimmed requests, whitespace-only input, configured over-limit input, invalid answer style/difficulty, the response contract, every response-validation rule, provider failure diagnostics, backend session metadata, the exact backend URL, no silent mock fallback and legacy migration.

`tests/persistence.test.mjs` uses a mocked browser storage and never calls Gemini. It covers:

- Save and reload with stable IDs and timestamps.
- Saving the same session twice without creating a duplicate.
- Note de-duplication and cleanup when the last reference is removed.
- Migration of legacy unversioned arrays.
- Corrupt history and corrupt notes being backed up rather than replaced.
- Newer schema versions being left untouched and reported.
- Quota exhaustion and blocked storage producing clear failures without crashing the UI.
- Quiz answer and card-progress normalisation, including reviewed cards.
- Search by topic (case-insensitive) and difficulty, answer-style, completed, in-progress, not-started and known-card filters.
- Deletion updating every derived statistic.
- Repeated attempts and scoring being counted once per saved record.
- Empty history producing zero/`null` analytics and an empty activity baseline.

### Real provider smoke test

The automated tests are mocked. To verify real Gemini generation, configure a valid `GEMINI_API_KEY` and `GEMINI_MODEL` in `backend/.env`, start the backend, and run the `curl` request under [Test generation](#4-test-generation), or generate from the UI. Only that manual/real check exercises the live provider. Check the returned summary, concepts, five questions, explanations and flashcards for accuracy; automated validation cannot judge factual correctness.

### Manual checklist

1. Submit empty or whitespace-only fields: inline errors appear, focus moves to the first field, and no request is made.
2. Paste a topic over 120 characters or notes over 20,000 characters: the counter shows the true length, an over-limit warning appears and generation is blocked. Content is preserved, not truncated.
3. Type past 90% of a limit: the counter and a "characters left" warning appear.
4. Clear both radio groups with the console and submit: answer-style and difficulty errors appear and generation is blocked.
5. Generate valid material: the form enters `loading`, Generate is disabled, a duplicate submit is ignored, and one result renders and saves.
6. Stop the backend and generate: the alert says the backend cannot be reached, the inputs remain, and no mock content appears.
7. Temporarily remove `GEMINI_API_KEY` from `backend/.env` and restart: generation returns a clear configuration error (503), not mock content.
8. Use an invalid key: the UI shows a safe authentication error and never displays the key.
9. Start a slow generation, then reopen a History record: the slow response must not replace the reopened record.
10. Reopen a saved generation: quiz answers and card progress are restored. Check History, Progress, the dashboard and the theme toggle still behave as before.
11. Save a session, reload the page: the session, its progress and every statistic are restored with the same ID and original creation date.
12. Save or reopen the same session twice: History still shows one entry, not a duplicate.
13. Search History by part of a topic and combine it with difficulty, answer style and progress filters: the list and counts update, and no-results states are shown.
14. Delete a saved session and confirm: only that record disappears and dashboard, History and Progress totals update immediately. Cancel the confirmation to keep it.
15. With DevTools, corrupt `mindforge:generations`, reload and confirm the raw payload is copied to `mindforge:generations:backup` and a clear notice appears instead of silent data loss.
16. Clear all saved sessions: statistics show `0`/`—`, the activity chart is empty and the streak reads `0` without fabricated data.
17. Check the workspace, result tabs and History at 375px width: no horizontal overflow, including the filter toolbar.
18. Confirm DevTools shows requests only to the MindForge backend, never to Google Gemini, and that no key appears in the browser or console.

## Scope for this part

Phase 4 hardens browser-local persistence and analytics. It adds a versioned history schema, legacy migration, duplicate-ID protection, content-addressed notes, corruption backups, quota and blocked-storage handling, search and filters, confirmed deletion, reviewed-card tracking and record-based analytics. The existing UI, theme, navigation, API contract and Gemini generation flow are unchanged. Work stops here; no deployment, accounts, backend persistence or additional phases are included.

## Notes

- The only remaining dashboard fixtures are the user profile and weekly goal. All study statistics, session lists, activity bars, topics and progress figures derive from saved records.
- The test-only mock generator returns a Promise after a short delay, but production generation always goes through the FastAPI backend.
- Quiz attempts are counted per saved session, not per restart. A restart replaces that session's answers; attempt-by-attempt history is not stored.
- History and notes are local to one browser profile. There is no account, export, import or cross-device sync, and browser cleanup can erase them permanently.
- A local static server is required for consistent API calls, history, clipboard and hash behaviour. Opening `index.html` via `file://` will not reach the backend in most browsers.
- Tested in current Chrome, with responsive checks from 1440px down to 360px.

