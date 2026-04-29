# BPMF — Zhuyin Practice ㄅㄆㄇㄈ

A Chinese Zhuyin (Bopomofo / 注音符號) practice game for kids. The app picks characters from story texts one by one and asks the child to choose the correct one, building familiarity with character shapes and their Zhuyin pronunciations.

![icon](public/logo192.png)

## How to Play

1. On the start screen, pick a story (or paste your own text).
2. Characters from the story are revealed one at a time. For each blank, choose the correct character from 4–8 options.
3. Wrong answers add more options; a hint button shows 10 scrambled characters (including the correct one).
4. Finishing a story updates its practice score.

## Spaced Repetition Scoring

Each story has a priority score from 1 to 10. Higher score = more overdue for practice:

- **10**: never practiced, or longest since last practice.
- **1**: just completed.
- Completing a story bumps every other story's score up so the oldest one returns to 10 once you've cycled through the rest.
- Scores show on the story buttons on the start screen.

Scores are persisted in browser `localStorage` under `bpmf_completion_records`. Clearing browser data resets progress.

## Commands

```bash
npm start        # Vite dev server at http://localhost:3000/BPMF/
npm run build    # production build into build/
npm run preview  # preview the production build locally
npm run deploy   # build + publish to GitHub Pages
```

Built with [Vite](https://vite.dev/) + React 19.

## Adding Stories

Edit [src/texts.js](src/texts.js):

- Each story is a string constant. The first line is used as the story title.
- Add it to the `allTexts` array to make it appear on the start screen.
- IVS (Ideographic Variation Sequence) selectors are supported for character variants.

## Fonts & Theme

- Zhuyin fonts: [BpmfZihiOnly](src/assets/fonts/BpmfZihiOnly-R.ttf), [BpmfZihiSans](src/assets/fonts/BpmfZihiSans-Regular.ttf).
- Theme: Solarized Dark (background `#002b36`, text `#839496`).
- Completed characters render in the Zhuyin font (with pronunciation marks); option buttons use a regular font so they don't give the answer away.

## Project Layout

```
src/
├── App.js          # main logic (state, scoring, character extraction)
├── App.css         # styles
├── texts.js        # story texts
├── Fonts.css       # font face declarations
└── assets/fonts/   # Zhuyin TTF files
```

See [CLAUDE.md](CLAUDE.md) for implementation details.
