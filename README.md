# MindForge

**Shape the way you learn.**

A premium, local-first study workspace for deliberate learning. Phase 0, Part 1 delivered the dashboard foundation — visual system, navigation, theme persistence, study statistics, recent sessions and activity visualisation. Part 2 added the Study Workspace and local mock generation. Part 3 made the generated material interactive: a readable summary, a five-question scored quiz, flip flashcards, saved generations and progress derived from your own answers. Phase 1 hardens that workflow with explicit generation states, configurable input limits, runtime response validation and a single provider-ready generation interface.

No frameworks, no backend, no AI calls. Plain HTML, CSS and vanilla JavaScript. Phase 1 is mock-only: no FastAPI service, Gemini integration, API key or network generation exists yet.

## Run it

You need to run both the frontend and the backend.

### Backend (FastAPI)

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a virtual environment (macOS):
```bash
python3 -m venv venv
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. (Optional) Copy and configure environment variables:
```bash
cp .env.example .env
```

5. Start the backend server:
```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend API will be available at <http://127.0.0.1:8000>. API docs at <http://127.0.0.1:8000/docs>. Health check at <http://127.0.0.1:8000/api/health>.

### Frontend

There is no build step. Serve the folder locally from the root directory:

```bash
python3 -m http.server 8000
```

Or use a different port if 8000 is taken by the backend. If you use a different port, update the backend CORS settings and/or frontend API config.

Then visit <http://localhost:8000>. A local server is recommended so clipboard, downloads and `localStorage` behave consistently.

**Note:** The frontend now sends requests to the backend API by default. Make sure the backend is running, or you can configure the API URL via `MindForgeApiConfig.setApiBaseUrl()`.

## What is included

- **Premium dashboard** with a welcome panel, daily focus dial, four derived statistics, recent sessions, a seven-day activity chart and a weekly goal ring.
- **Working study workspace** with topic and notes fields, live character counters, near-limit warnings, answer-style and quiz-difficulty choices, inline validation, duplicate-submission protection, explicit `idle`/`loading`/`success`/`error` states, stale-response guards and recoverable retry.
- **Local study generation** that shapes your notes into a structured summary, a five-question retrieval quiz with explanations, and a flashcard deck. Generation runs entirely in the browser — there is no account, network request or AI service involved.
- **Validated generation contract** that trims and checks the request before generation, rejects malformed provider responses at runtime, and migrates Phase 0 history records to the current shape when they are read.
- **Interactive result tabs** for Summary, Quiz and Flashcards, with arrow-key, Home and End keyboard navigation.
- **Summary actions** that copy the summary and key concepts through the Clipboard API (with a legacy copy fallback) and download the same content as a `.txt` file.
- **Scored retrieval quiz** with dynamic options, one-shot scoring, correct/incorrect feedback, the correct answer, an explanation, a running score, a final percentage and a working Restart action.
- **Flip flashcards** with accessible Known / Not known controls and a live mastered count. The flip is a 3D transform that respects `prefers-reduced-motion`.
- **Saved generations** in History. Every completed generation is saved automatically, can be reopened with its quiz answers and card mastery restored, and can be deleted individually.
- **Live progress** derived from saved records: quiz average, questions answered, cards known, topics explored and a per-session summary. Empty history is handled without errors.
- **Single-page navigation** across Dashboard, Study Workspace, History, Progress and Settings. The active section is highlighted, the URL hash is deep-linkable, and each view moves focus to its heading.
- **Persistent theme** with a light/dark toggle in the top bar and matching controls in Settings. The choice is saved to `localStorage` under `mindforge:theme`; with no saved choice, MindForge follows the OS preference. Theme changes are mirrored between tabs.
- **Responsive sidebar** that becomes a keyboard-accessible off-canvas drawer below 1140px, with a scrim, focus trap, Escape-to-close and a working mobile menu button.
- **Realistic mock data** for 16 study sessions across nine subjects, quiz scores, flashcard decks and fourteen days of activity.
- **Accessibility basics**: semantic landmarks, skip link, visible focus indicators, `aria-current` navigation, labelled icon buttons, inline `aria-invalid` field errors, tab and radio semantics, live-region feedback and `prefers-reduced-motion` support.
- **Design tokens** for colour, spacing, borders, radii, shadows and typography, with full light and dark palettes.

## Study Workspace

The workspace form asks for a topic and notes, plus two choices:

| Field | Rules |
| --- | --- |
| Topic | Required after trimming. Maximum 120 characters. |
| Notes | Required after trimming. Maximum 20,000 characters. |
| Answer style | Explain Like I'm 10 · Exam-Focused · Detailed. Sets the summary tone and the number of key concepts (3, 4 or 5). |
| Quiz difficulty | Easy · Medium · Hard. Every quiz has five questions. Difficulty adds estimated minutes and changes the flashcard count (4, 5 or 6). |

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
    flashcards: { known: [cardId] }
  },
  savedAt, updatedAt
}
```

The generator is accessed through one frontend interface:

```js
MindForgeGeneration.generate({ topic, notes, answerStyle, difficulty });
```

It validates the request, calls the current provider and validates the response. The local mock is the only provider shipped:

```js
MindForgeGeneration.getProviderName(); // "local-mock"
MindForgeGeneration.setProvider(providerFunction, 'my-provider');
MindForgeGeneration.resetProvider();
```

A future `api.js` can be injected with `setProvider` without moving provider logic into UI components. Phase 1 does not implement that provider.

### Validation and diagnostics

- Request validation returns per-field errors (`required`, `too-long`, `invalid-setting`) and trimmed values.
- Response validation checks summary text and concepts, exactly five quiz questions, four non-empty options each, integer `correctAnswer` values from 0 through 3, non-empty explanations, and non-empty flashcards with both faces.
- Invalid responses surface a plain-language error and are never saved or partially rendered. Safe diagnostics (error paths/codes and the received top-level shape) are retained in `MindForgeWorkspace.getLastDiagnostics()`; raw provider errors and note contents are not exposed.
- Legacy Phase 0 records (`summary.overview`/`keyPoints`, `quiz.questions[].prompt`/`answerIndex`) are migrated to the current contract when History reads them.

## How the interactive result works

- **Summary** renders the generated summary text and key concepts as text nodes (never as HTML). Copy writes a plain-text version, including the title and key concepts, to the clipboard. Download creates a Blob, triggers a temporary link and revokes the object URL.
- **Quiz** builds each question from the generated data. Selecting an option locks that question, reveals feedback and the correct answer, and scores it exactly once. The final panel shows `correct / total` and a percentage. Restart clears every answer and persists the clean state.
- **Flashcards** flip on click or keyboard activation. Known and Not known update `aria-pressed`, the card styling, the mastered count and the saved progress immediately. Long faces scroll inside the card rather than breaking the layout.
- **Tabs** use `role="tablist"`, `role="tab"` and `role="tabpanel"` with `aria-selected`, roving `tabindex` and arrow/Home/End navigation.

## Persistence

| Key | Purpose |
| --- | --- |
| `mindforge:theme` | Light or dark preference. |
| `mindforge:generations` | Up to 30 saved generations, newest first. |

- Completed generations are saved automatically after a successful generation.
- Opening a saved generation restores its quiz answers and known cards.
- Deleting a record removes only that record. Unrelated `localStorage` keys are left untouched.
- History is mirrored across tabs through the `storage` event.
- `MindForgeStorage` falls back to an in-memory store when `localStorage` is blocked or full. In that case the UI reports that the session could not be saved to History, but generation and interaction still work.
- Clipboard failures fall back to `document.execCommand('copy')`; if both fail, the UI explains that the summary must be copied manually. Download failures are reported in the same status line.

## Project structure

```text
MindForge/
├── index.html            # App shell, all five views and the SVG icon sprite
├── assets/
│   └── favicon.svg       # Brand mark
├── css/
│   ├── styles.css        # Tokens, layout, components and motion
│   └── responsive.css    # Tablet, phone and drawer behaviour
├── js/
│   ├── app.js            # Derived statistics, dashboard, History and Progress
│   ├── generation.js     # Single validated generation interface and provider injection
│   ├── history.js        # Saved-generation store, contract validation and progress hydration
│   ├── learning.js       # Result tabs, quiz, flashcards, copy and download
│   ├── mock-data.js      # Deterministic mock fixtures
│   ├── mock-generator.js # Local study-material provider (no network)
│   ├── navigation.js     # Hash routing, focus management, mobile drawer
│   ├── storage.js        # Defensive localStorage wrapper
│   ├── study-contract.js # Configurable limits, request/response validation, migration
│   ├── theme.js          # Theme persistence and cross-tab sync
│   └── workspace.js      # Form validation, state machine, generation and reopening
├── tests/
│   └── contract.test.mjs # Contract, generation and migration tests
├── .gitignore
└── README.md
```

## Tests

The contract, mock generator, generation service and legacy migration are covered by Node's built-in test runner (Node 18+). No dependencies are required:

```bash
node --test tests/contract.test.mjs
```

The suite covers valid and trimmed requests, whitespace-only input, configured over-limit input, invalid answer style/difficulty, the mock response contract, every response-validation rule (missing fields, wrong quiz count, wrong option count, empty strings, out-of-range/fractional/string answer indexes), provider failure diagnostics, and legacy Phase 0 migration.

### Phase 1 manual checklist

1. Submit empty or whitespace-only fields: inline errors appear, focus moves to the first field, and no provider call is made.
2. Paste a topic over 120 characters or notes over 20,000 characters: the counter shows the true length, an over-limit warning appears and generation is blocked. Content is preserved, not truncated.
3. Type past 90% of a limit: the counter and a "characters left" warning appear.
4. Clear both radio groups with the console and submit: answer-style and difficulty errors appear and generation is blocked.
5. Generate valid material: the form enters `loading`, Generate is disabled, a duplicate submit is ignored, and one result renders and saves.
6. Simulate a provider failure (`MindForgeGeneration.setProvider(() => Promise.reject(new Error('fail')))`): the form enters `error`, inputs remain, the alert is focused and Retry succeeds after the provider is restored.
7. Simulate a malformed response (`setProvider(() => Promise.resolve({ summary: { text: 'x', keyConcepts: ['y'] }, quiz: [], flashcards: [] }))`): the form enters `error`, no result is saved, and diagnostics list the failing paths.
8. Start a slow generation, then reopen a History record: the slow response must not replace the reopened record.
9. Reopen a saved generation: quiz answers and card mastery are restored. Check History, Progress, the dashboard and the theme toggle still behave as before.
10. Check the workspace, result tabs and History at 375px width: no horizontal overflow.
11. Confirm DevTools shows no external network requests, console errors or exceptions.

## Scope for this part

Phase 1 hardens the Phase 0 workflow: generate, validate, read the summary, take a five-question quiz, review flashcards, reopen the session from History and see the saved results in Progress. AI remains mocked; there is no Gemini integration, backend, account or network request. The project intentionally stops here — FastAPI and Gemini are not implemented.

## Notes

- Dates in the mock fixtures are generated relative to the current day so recency labels remain believable.
- The generator returns a Promise after a short delay to exercise real loading states, but performs no network request.
- Dashboard statistics merge the mock fixtures with saved generations. Quiz averages include only saved sessions with at least one answered question.
- The site works from `file://`, but a local server is recommended for consistent history, clipboard and hash behaviour.
- Tested in current Chrome, with responsive checks from 1440px down to 360px.
