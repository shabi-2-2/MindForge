# MindForge

**Shape the way you learn.**

A premium, local-first study workspace for deliberate learning. Phase 0, Part 1 delivered the dashboard foundation — visual system, navigation, theme persistence, study statistics, recent sessions and activity visualisation. Part 2 adds a working Study Workspace that turns a topic and notes into a structured summary, retrieval quiz and flashcard deck.

No frameworks, no backend, no AI calls. Plain HTML, CSS and vanilla JavaScript.

## Run it

There is no build step. Open `index.html` directly, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## What is included

- **Premium dashboard** with a welcome panel, daily focus dial, four derived statistics, recent sessions, a seven-day activity chart and a weekly goal ring.
- **Working study workspace** with topic and notes fields, live character counters, answer-style and quiz-difficulty choices, inline validation, duplicate-submission protection, a loading state and graceful error recovery.
- **Local study generation** that shapes your notes into a structured summary, a scored retrieval quiz with explanations, and a flashcard preview. Generation runs entirely in the browser — there is no account, network request or AI service involved.
- **Single-page navigation** across Dashboard, Study Workspace, History, Progress and Settings. The active section is highlighted, the URL hash is deep-linkable, and each view moves focus to its heading.
- **Persistent theme** with a light/dark toggle in the top bar and matching controls in Settings. The choice is saved to `localStorage` under `mindforge:theme`; with no saved choice, MindForge follows the OS preference. Theme changes are mirrored between tabs.
- **Responsive sidebar** that becomes a keyboard-accessible off-canvas drawer below 1140px, with a scrim, focus trap, Escape-to-close and a working mobile menu button.
- **Realistic mock data** for 16 study sessions across nine subjects, quiz scores, flashcard decks and fourteen days of activity.
- **Accessibility basics**: semantic landmarks, skip link, visible focus indicators, `aria-current` navigation, labelled icon buttons, inline `aria-invalid` field errors, live-region feedback and `prefers-reduced-motion` support.
- **Design tokens** for colour, spacing, borders, radii, shadows and typography, with full light and dark palettes.

All dashboard statistics are computed from the fixtures in `js/mock-data.js`:

- Study sessions: total sessions in the mock history.
- Completed quizzes: sessions with a numeric quiz score.
- Average quiz score: mean of all quiz scores.
- Mastered flashcards: sum of mastered cards across decks.
- Recent sessions: the five newest mock sessions.
- Activity, weekly goal and streak: derived from the activity and goal fixtures.

## Study Workspace

The workspace form asks for a topic (up to 120 characters) and notes (up to 5,000 characters), plus two choices:

| Choice | Options | Effect |
| --- | --- | --- |
| Answer style | Explain Like I'm 10 · Exam-Focused · Detailed | Sets the summary tone and the number of key points (3, 4 or 5). |
| Quiz difficulty | Easy · Medium · Hard | Sets the quiz length (3, 4 or 5 questions) and flashcard count (4, 5 or 6). |

Submitting the form:

1. Validates both fields and focuses the first problem.
2. Disables the button, sets `aria-busy`, and shows a loading indicator plus live status text. A second submission is ignored while generation is running.
3. Waits briefly to simulate asynchronous work, then renders the result in a full-width preview below the form.
4. On failure, restores the form, keeps the previous result visible and moves focus to an alert with a plain-language message.

The generated result is available to later parts of the build through `window.MindForgeWorkspace.getLastResult()` and the `mindforge:studymaterialready` document event. Its shape is:

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

Everything is deterministic local mock content built from the supplied notes, with sensible fallbacks when the notes are short. Results live in memory for the current page only; refreshing clears them.

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
│   ├── app.js            # Derived statistics and dashboard rendering
│   ├── mock-data.js      # Deterministic mock fixtures
│   ├── mock-generator.js # Local study-material generator (no network)
│   ├── navigation.js     # Hash routing, focus management, mobile drawer
│   ├── storage.js        # Defensive localStorage wrapper
│   ├── theme.js          # Theme persistence and cross-tab sync
│   └── workspace.js      # Form validation, loading states and result rendering
├── .gitignore
└── README.md
```

## Scope for this part

Part 2 stops at local generation and preview. The quiz and flashcards are rendered for reading only — interactive answering, scoring and card review arrive in Part 3. Generated sessions are not yet saved to history or progress; those views continue to use the mock fixtures.

The “Create study session” action opens the Study Workspace and focuses the topic field.

## Notes

- Dates in the mock fixtures are generated relative to the current day so recency labels remain believable.
- The generator returns a Promise after a short delay to exercise real loading states, but performs no network request.
- The site works from `file://`, but a local server is recommended for consistent history and hash behaviour.
- Tested in current Chrome, with responsive checks from 1440px down to 360px in both themes.
