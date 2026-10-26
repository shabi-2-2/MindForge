# MindForge

**Shape the way you learn.**

A premium, local-first study dashboard for deliberate learning. Phase 0, Part 1 delivers the dashboard foundation: the visual system, navigation, theme persistence, study statistics, recent sessions and a study-activity visualisation.

No frameworks, no backend, no AI calls. Plain HTML, CSS and vanilla JavaScript.

## Run it

There is no build step. Open `index.html` directly, or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit <http://localhost:8000>.

## What is included

- **Premium dashboard** with a welcome panel, daily focus dial, four derived statistics, recent sessions, a seven-day activity chart and a weekly goal ring.
- **Single-page navigation** across Dashboard, Study Workspace, History, Progress and Settings. The active section is highlighted, the URL hash is deep-linkable, and each view moves focus to its heading.
- **Persistent theme** with a light/dark toggle in the top bar and matching controls in Settings. The choice is saved to `localStorage` under `mindforge:theme`; with no saved choice, MindForge follows the OS preference. Theme changes are mirrored between tabs.
- **Responsive sidebar** that becomes a keyboard-accessible off-canvas drawer below 1140px, with a scrim, focus trap, Escape-to-close and a working mobile menu button.
- **Realistic mock data** for 16 study sessions across nine subjects, quiz scores, flashcard decks and fourteen days of activity.
- **Accessibility basics**: semantic landmarks, skip link, visible focus indicators, `aria-current` navigation, labelled icon buttons, a live-region toast and `prefers-reduced-motion` support.
- **Design tokens** for colour, spacing, borders, radii, shadows and typography, with full light and dark palettes.

All dashboard statistics are computed from the fixtures in `js/mock-data.js`:

- Study sessions: total sessions in the mock history.
- Completed quizzes: sessions with a numeric quiz score.
- Average quiz score: mean of all quiz scores.
- Mastered flashcards: sum of mastered cards across decks.
- Recent sessions: the five newest mock sessions.
- Activity, weekly goal and streak: derived from the activity and goal fixtures.

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
│   ├── app.js            # Derived statistics and view rendering
│   ├── mock-data.js      # Deterministic mock fixtures
│   ├── navigation.js     # Hash routing, focus management, mobile drawer
│   ├── storage.js        # Defensive localStorage wrapper
│   └── theme.js          # Theme persistence and cross-tab sync
├── .gitignore
└── README.md
```

## Scope for this part

Part 1 stops at the dashboard foundation. Study-session generation, quizzes, flashcard review and learning results are intentionally **not implemented**. The Study Workspace, History and Progress areas preview what arrives in later parts; History uses the existing mock session record.

The “Create study session” action is a deliberate preview: it opens the Study Workspace and explains that the builder arrives in Part 2.

## Notes

- Dates in the mock fixtures are generated relative to the current day so recency labels remain believable.
- The site works from `file://`, but a local server is recommended for consistent history and hash behaviour.
- Tested in current Chrome, with responsive checks at desktop, tablet and phone widths.
