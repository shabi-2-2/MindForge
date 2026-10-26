# MindForge

**Shape the way you learn.**

A premium, local-first study workspace for deliberate learning. Phase 0, Part 1 delivered the dashboard foundation — visual system, navigation, theme persistence, study statistics, recent sessions and activity visualisation. Part 2 added the Study Workspace and local mock generation. Part 3 makes the generated material interactive: a readable summary, a five-question scored quiz, flip flashcards, saved generations and progress derived from your own answers.

No frameworks, no backend, no AI calls. Plain HTML, CSS and vanilla JavaScript.

## Run it

There is no build step. Open `index.html` directly, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>. A local server is recommended so clipboard, downloads and `localStorage` behave consistently.

## What is included

- **Premium dashboard** with a welcome panel, daily focus dial, four derived statistics, recent sessions, a seven-day activity chart and a weekly goal ring.
- **Working study workspace** with topic and notes fields, live character counters, answer-style and quiz-difficulty choices, inline validation, duplicate-submission protection, a loading state and graceful error recovery.
- **Local study generation** that shapes your notes into a structured summary, a five-question retrieval quiz with explanations, and a flashcard deck. Generation runs entirely in the browser — there is no account, network request or AI service involved.
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

The workspace form asks for a topic (up to 120 characters) and notes (up to 5,000 characters), plus two choices:

| Choice | Options | Effect |
| --- | --- | --- |
| Answer style | Explain Like I'm 10 · Exam-Focused · Detailed | Sets the summary tone and the number of key points (3, 4 or 5). |
| Quiz difficulty | Easy · Medium · Hard | Every quiz has five questions. Difficulty adds estimated minutes and changes the flashcard count (4, 5 or 6). |

Submitting the form:

1. Validates both fields and focuses the first problem.
2. Disables the button, sets `aria-busy`, and shows a loading indicator plus live status text. A second submission is ignored while generation is running.
3. Waits briefly to simulate asynchronous work, then saves the result to History and renders the interactive result below the form.
4. On failure, restores the form, keeps the previous result visible and moves focus to an alert with a plain-language message.

The generated result is available through `window.MindForgeWorkspace.getLastResult()` and the `mindforge:studymaterialready` document event. Its base shape is:

```js
{
  id, createdAt, topic, notes,
  config: { answerStyle, answerStyleLabel, difficulty, difficultyLabel },
  summary: { title, overview, keyPoints, estimatedMinutes },
  quiz: {
    difficulty, difficultyLabel,
    questions: [{ id, prompt, options, answerIndex, explanation }]
  },
  flashcards: [{ id, front, back }],
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

## How the interactive result works

- **Summary** renders the generated overview and key concepts as text nodes (never as HTML). Copy writes a plain-text version, including the title and key concepts, to the clipboard. Download creates a Blob, triggers a temporary link and revokes the object URL.
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
│   ├── history.js        # Saved-generation store and progress hydration
│   ├── learning.js       # Result tabs, quiz, flashcards, copy and download
│   ├── mock-data.js      # Deterministic mock fixtures
│   ├── mock-generator.js # Local study-material generator (no network)
│   ├── navigation.js     # Hash routing, focus management, mobile drawer
│   ├── storage.js        # Defensive localStorage wrapper
│   ├── theme.js          # Theme persistence and cross-tab sync
│   └── workspace.js      # Form validation, generation and saved-session reopening
├── .gitignore
└── README.md
```

## Scope for this part

Part 3 completes the Phase 0 interactive workflow: generate, read the summary, take a five-question quiz, review flashcards, reopen the session from History and see the saved results in Progress. AI remains mocked; there is no Gemini integration, backend, account or network request.

## Notes

- Dates in the mock fixtures are generated relative to the current day so recency labels remain believable.
- The generator returns a Promise after a short delay to exercise real loading states, but performs no network request.
- Dashboard statistics merge the mock fixtures with saved generations. Quiz averages include only saved sessions with at least one answered question.
- The site works from `file://`, but a local server is recommended for consistent history, clipboard and hash behaviour.
- Tested in current Chrome, with responsive checks from 1440px down to 360px.
