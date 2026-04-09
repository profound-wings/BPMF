# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chinese Zhuyin (Bopomofo/注音符號) learning game built with React. The application helps children practice reading Chinese characters by presenting fill-in-the-blank exercises from story texts. It implements a spaced repetition scoring system to optimize learning.

## Commands

- `npm start` - Run development server at http://localhost:3000
- `npm test` - Run tests in watch mode
- `npm run build` - Build for production to `build/` folder

## Architecture

### Core Application Logic (src/App.js)

The main application is a single-file React component with three screens:
1. **Start screen**: Text input and story selection buttons
2. **Game screen**: Character-by-character fill-in-the-blank exercise
3. **Complete screen**: Shows results and updated practice score

### Spaced Repetition Scoring System

Stories are scored from 1-10 points based on practice priority:
- **10 points**: Never completed or needs most practice (highest priority)
- **1 point**: Just completed (lowest priority)
- Scores are displayed on story buttons and in the completion screen
- Internal scores use floats for precision; `Math.floor()` applied when displaying

**Score Algorithm (adapts dynamically to story count):**
- When a story is completed: set to `MIN_SCORE` (1)
- All other stories increase by: `(MAX_SCORE - MIN_SCORE) / (allTexts.length - 1)`
- Formula ensures: the oldest completed story returns to `MAX_SCORE` after all others are completed
- Enforcement logic guarantees oldest story (smallest `order`) reaches exactly `MAX_SCORE`
- Prevents floating-point drift from keeping scores below maximum

**Constants (in src/App.js):**
- `MAX_SCORE = 10` - Highest priority score
- `MIN_SCORE = 1` - Lowest priority score

localStorage storage format in `STORAGE_KEY = 'bpmf_completion_records'`:
```javascript
{
  "故事標題": {
    score: Number,         // Float 1-10 (floored for display)
    lastCompleted: String, // ISO 8601 UTC datetime (e.g., "2026-02-19T14:30:00.000Z")
    order: Number          // Completion sequence (lower = older)
  }
}
```

### Character Extraction and Game Mechanics

- **Regex pattern**: `/[\u4E00-\u9FFF]([\uD800-\uDBFF][\uDC00-\uDFFF])?/g`
  - Matches Chinese characters including IVS (Ideographic Variation Sequence) selectors
  - This handles special character variations (e.g., 󠇡󠇢󠇣) used in the story texts

- **Choice generation**: Uses Fisher-Yates shuffle to randomize options
  - Minimum 4 choices (MIN_CHOICES)
  - Maximum 8 choices (MAX_CHOICES)
  - Wrong answers increase choice count by 1 (making it harder to guess)

- **Hint system**: Shows 10 scrambled characters (SCRAMBLED_DISPLAY_COUNT) including the correct answer

### Text Content (src/texts.js)

Story texts are stored as string constants and exported in the `allTexts` array. When adding new stories:
- First line is used as the story identifier/title
- Must contain Chinese characters (validated on game start)
- Can include IVS variation selectors for character variants

### Font and Styling

- Uses custom Zhuyin fonts loaded in src/Fonts.css from src/assets/
- Solarized Dark color scheme (#002b36 background, #839496 text)
- `.completed-text` uses Zhuyin font to display characters with pronunciation marks
- Choice buttons use regular font (no Zhuyin marks)

### State Management

Key state variables:
- `characterList`: Array of {char, index} extracted from text
- `currentCharIndex`: Progress through the character list
- `choiceCount`: Number of options shown (increases on wrong answer)
- `wrongChars`: Characters answered incorrectly
- `hintUsedChars`: Characters where hint was used
- Persistent data is stored in localStorage via `getStorage()` and `setStorage()` utility functions

### Important Functions

- `getTextScore(textKey)`: Returns floored 1-10 score for display
- `saveCompletionRecord(textKey)`: Updates all scores when a story is completed; enforces MAX_SCORE for oldest
- `extractChineseCharacters(text)`: Extracts Chinese chars with IVS support
- `generateOptions(uniqueChars, correctAnswer, count)`: Creates shuffled choices

## Key Implementation Details

### Low-Score Confirmation
When starting a story with score < MAX_SCORE, user gets a confirmation dialog showing the current score. This encourages practicing higher-priority stories first while still allowing free choice.

### Score Updates
Scores update in `saveCompletionRecord()` which is called in useEffect when `isGameComplete` becomes true. This ensures proper timing and prevents race conditions.

**Score increment calculation:**
```javascript
const scoreIncrement = (MAX_SCORE - MIN_SCORE) / (allTexts.length - 1);
```
- Dividing by `(length - 1)` rather than `length` ensures score conservation
- When 1 story drops by 9 points (10→1), the other (N-1) stories gain 9 points total
- This guarantees the oldest story reaches exactly MAX_SCORE after completing all others

### Backward Compatibility
The system supports both old format (date string at top level) and new format (object with score/lastCompleted/order). Old entries are automatically converted when encountered, preserving the original date string in the `lastCompleted` field.
