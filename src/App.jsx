import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import './Fonts.css';
import './App.css';
import { allTexts } from './texts';

// Constants
const MIN_CHOICES = 4;
const STORAGE_KEY = 'bpmf_completion_records';
const MAX_SCORE = 10;
const MIN_SCORE = 1;

// localStorage utility functions
const getStorage = (key) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : {};
  } catch {
    return {};
  }
};

const setStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to save to localStorage:', error);
  }
};

// Get text identifier (first line as key)
const getTextKey = (text) => {
  return text.split('\n')[0].trim();
};

// Save completion record with score
// Uses retry mechanism to handle race conditions from multiple windows
const saveCompletionRecord = (textKey, earnedScore, maxRetries = 3) => {
  const timestamp = new Date().toISOString();
  const scoreIncrement = (MAX_SCORE - MIN_SCORE) / (allTexts.length - 1);

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Read fresh data on each attempt to avoid race conditions
      const records = getStorage(STORAGE_KEY);

      // Migrate all old format records (string) to new format before processing
      // This ensures old data doesn't interfere with score calculations
      Object.keys(records).forEach(key => {
        if (typeof records[key] === 'string') {
          // Old format was a date string - convert once with proper order
          records[key] = {
            score: MAX_SCORE,
            lastCompleted: records[key],
            order: 0 // Will be reassigned if completed again
          };
        }
      });

      // Find the highest order number
      const maxOrder = Object.values(records).reduce((max, record) => {
        const order = typeof record === 'object' ? record.order : 0;
        return Math.max(max, order);
      }, 0);

      // Save this record with score 1 (just completed) and new order
      records[textKey] = {
        score: MIN_SCORE,
        lastCompleted: timestamp,
        order: maxOrder + 1,
        earnedScore: earnedScore // Record the score earned at completion
      };

      // Increase score for all other texts (accumulate as float)
      Object.keys(records).forEach(key => {
        if (key !== textKey) {
          records[key].score = Math.min(MAX_SCORE, records[key].score + scoreIncrement);
        }
      });

      // Find the oldest completed story (smallest order) among current stories
      // Only consider stories that exist in allTexts to avoid issues with deleted stories
      const currentTextKeys = allTexts.map(text => getTextKey(text));
      let oldestKey = null;
      let oldestOrder = Infinity;

      currentTextKeys.forEach(key => {
        const record = records[key];
        if (record && typeof record === 'object' && record.order > 0) {
          if (record.order < oldestOrder) {
            oldestOrder = record.order;
            oldestKey = key;
          }
        }
      });

      // If the oldest story has gone through a complete cycle, set it to MAX_SCORE
      if (oldestKey && (maxOrder + 1 - oldestOrder) >= allTexts.length - 1) {
        records[oldestKey].score = MAX_SCORE;
      }

      setStorage(STORAGE_KEY, records);
      return; // Success, exit
    } catch (error) {
      console.error(`Save attempt ${attempt + 1} failed:`, error);
      if (attempt === maxRetries - 1) {
        console.error('Failed to save completion record after max retries');
      }
    }
  }
};

// Get score for a text (1-10, higher means should practice more)
const getTextScore = (textKey) => {
  const records = getStorage(STORAGE_KEY);
  const record = records[textKey];

  // If never completed, return max score (10)
  if (!record) return MAX_SCORE;

  // Support old format (return max score)
  if (typeof record === 'string') return MAX_SCORE;

  // Return the score (floor to display as integer)
  return Math.floor(record.score);
};

// Get the score earned during last completion (if any)
const getLastEarnedScore = (textKey) => {
  const records = getStorage(STORAGE_KEY);
  const record = records[textKey];

  // If never completed or old format, return null
  if (!record || typeof record === 'string') return null;

  // Return the earned score (if exists)
  return record.earnedScore || null;
};
const MAX_CHOICES = 8;
const SCRAMBLED_DISPLAY_COUNT = 10;
const FEEDBACK_DELAY = 300;

// Fisher-Yates shuffle algorithm
const shuffleArray = (array) => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// Extract Chinese characters from text (including IVS variation selectors)
const CHINESE_CHAR_REGEX = /[\u4E00-\u9FFF]([\uD800-\uDBFF][\uDC00-\uDFFF])?/g;

const extractChineseCharacters = (text) => {
  const matches = [...text.matchAll(CHINESE_CHAR_REGEX)];
  return matches.map((m) => ({ char: m[0], index: m.index }));
};

// Generate shuffled options with correct answer included
const generateOptions = (uniqueChars, correctAnswer, count) => {
  if (!correctAnswer || !uniqueChars.length) return [];
  const otherChars = uniqueChars.filter((c) => c[0] !== correctAnswer[0]);
  const selectedOthers = shuffleArray(otherChars).slice(0, count - 1);
  return shuffleArray([...selectedOthers, correctAnswer]);
};

function App() {
  // State
  const [inputText, setInputText] = useState('');
  const [gameStarted, setGameStarted] = useState(false);
  const [text, setText] = useState('');
  const [characterList, setCharacterList] = useState([]);
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [choiceCount, setChoiceCount] = useState(MIN_CHOICES);
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [hintUsedCount, setHintUsedCount] = useState(0);
  const [wrongChars, setWrongChars] = useState([]); // Track incorrectly answered characters
  const [hintUsedChars, setHintUsedChars] = useState([]); // Track characters where hint was used
  const [confirmDialog, setConfirmDialog] = useState(null); // { message, onConfirm, onCancel }
  const [startScore, setStartScore] = useState(MAX_SCORE); // Score at game start (for display on completion screen)
  const [lastEarnedScore, setLastEarnedScore] = useState(null); // Score earned during previous completion
  const [storageVersion, setStorageVersion] = useState(0); // Triggers re-render when localStorage changes in other windows

  // Refs
  const completedTextRef = useRef(null);

  // Derived state
  const currentCharInfo = characterList[currentCharIndex];
  const currentWord = currentCharInfo?.char || '';
  const currentTextIndex = currentCharInfo?.index ?? text.length;
  const isGameComplete = gameStarted && currentCharIndex >= characterList.length;
  const accuracy = totalAttempts > 0 ? Math.round((score / totalAttempts) * 100) : 0;
  const progress = characterList.length > 0 ? Math.round((currentCharIndex / characterList.length) * 100) : 0;

  // Auto-scroll to bottom when currentCharIndex changes
  useEffect(() => {
    if (completedTextRef.current) {
      completedTextRef.current.scrollTop = completedTextRef.current.scrollHeight;
    }
  }, [currentCharIndex]);

  // Listen for localStorage changes from other windows/tabs
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === STORAGE_KEY) {
        // Force re-render to update scores on start screen
        setStorageVersion(prev => prev + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save completion record when game is complete
  useEffect(() => {
    if (isGameComplete && text) {
      const textKey = getTextKey(text);
      saveCompletionRecord(textKey, startScore);
    }
  }, [isGameComplete, text, startScore]);

  // Memoized unique characters
  const uniqueCharacters = useMemo(() => {
    if (!text) return [];
    const chars = extractChineseCharacters(text).map((c) => c.char);
    return [...new Set(chars)];
  }, [text]);

  // Generate scrambled words for display (currentCharIndex ensures reshuffle on same char)
  const scrambledWords = useMemo(() =>
    generateOptions(uniqueCharacters, currentWord, SCRAMBLED_DISPLAY_COUNT),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uniqueCharacters, currentWord, currentCharIndex]
  );

  // Generate choice options (totalAttempts ensures reshuffle on wrong answer)
  const choiceOptions = useMemo(() =>
    generateOptions(uniqueCharacters, currentWord, choiceCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uniqueCharacters, currentWord, choiceCount, totalAttempts]
  );

  const resetGameState = useCallback(() => {
    setGameStarted(false);
    setText('');
    setCharacterList([]);
    setCurrentCharIndex(0);
    setChoiceCount(MIN_CHOICES);
    setScore(0);
    setTotalAttempts(0);
    setFeedback(null);
    setShowHint(false);
    setHintUsedCount(0);
    setWrongChars([]);
    setHintUsedChars([]);
    setStartScore(MAX_SCORE);
    setLastEarnedScore(null);
  }, []);

  const handleStartGame = useCallback(() => {
    if (!inputText.trim()) return;

    const chars = extractChineseCharacters(inputText);
    if (chars.length === 0) {
      alert('請輸入包含中文字的文章');
      return;
    }

    // Check if this story has the highest score
    const textKey = getTextKey(inputText);
    const currentScore = getTextScore(textKey);
    const previousScore = getLastEarnedScore(textKey);

    if (currentScore < MAX_SCORE) {
      setConfirmDialog({
        message: `完成這個故事分數只有 ${currentScore} 分，確定要繼續嗎？`,
        onConfirm: () => {
          setConfirmDialog(null);
          setText(inputText);
          setCharacterList(chars);
          setCurrentCharIndex(0);
          setChoiceCount(MIN_CHOICES);
          setScore(0);
          setTotalAttempts(0);
          setFeedback(null);
          setShowHint(false);
          setHintUsedCount(0);
          setWrongChars([]);
          setHintUsedChars([]);
          setStartScore(currentScore); // Save score at game start
          setLastEarnedScore(previousScore); // Save previously earned score
          setGameStarted(true);
        },
        onCancel: () => {
          setConfirmDialog(null);
        }
      });
      return;
    }

    setText(inputText);
    setCharacterList(chars);
    setCurrentCharIndex(0);
    setChoiceCount(MIN_CHOICES);
    setScore(0);
    setTotalAttempts(0);
    setFeedback(null);
    setShowHint(false);
    setHintUsedCount(0);
    setWrongChars([]);
    setHintUsedChars([]);
    setStartScore(currentScore); // Save score at game start
    setLastEarnedScore(previousScore); // Save previously earned score
    setGameStarted(true);
  }, [inputText]);

  // Handle hint button click
  const handleShowHint = useCallback(() => {
    if (!showHint) {
      setHintUsedCount((prev) => prev + 1);
      // Track characters where hint was used (avoid duplicates)
      if (currentWord && !hintUsedChars.includes(currentWord)) {
        setHintUsedChars((prev) => [...prev, currentWord]);
      }
    }
    setShowHint(true);
  }, [showHint, currentWord, hintUsedChars]);

  const handleWordClick = useCallback(
    (word) => {
      if (!currentWord || isProcessing) return;

      setIsProcessing(true);

      // Debug logging
      console.log(word === currentWord ? '✅ 答對了！' : '❌ 答錯了！');
      console.log('選擇:', word, '| 正確:', currentWord);
      console.log('提示:', scrambledWords.join(''));
      console.log('選項:', choiceOptions.map((opt, i) => `${i + 1}.${opt}`).join(' '));
      console.log('---');

      const isCorrect = word === currentWord;
      setFeedback(isCorrect ? 'correct' : 'wrong');

      if (isCorrect) {
        setScore((prev) => prev + 1);
      } else {
        // Track incorrect characters (avoid duplicates)
        if (!wrongChars.includes(currentWord)) {
          setWrongChars((prev) => [...prev, currentWord]);
        }
      }

      setTimeout(() => {
        setFeedback(null);
        setTotalAttempts((prev) => prev + 1); // Update after feedback animation, triggers option reshuffle
        if (isCorrect) {
          setCurrentCharIndex((prev) => prev + 1);
          setChoiceCount(MIN_CHOICES);
          setShowHint(false); // Reset hint visibility for next character
        } else {
          setChoiceCount((prev) => Math.min(prev + 1, MAX_CHOICES));
        }
        setIsProcessing(false);
      }, FEEDBACK_DELAY);
    },
    [currentWord, isProcessing, scrambledWords, choiceOptions, wrongChars]
  );

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!gameStarted || !currentWord) return;

      const keyNum = parseInt(event.key, 10);
      if (keyNum >= 1 && keyNum <= choiceOptions.length) {
        handleWordClick(choiceOptions[keyNum - 1]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameStarted, currentWord, choiceOptions, handleWordClick]);

  return (
    <div className="App">
      {/* Confirmation Dialog */}
      {confirmDialog && (
        <div className="dialog-overlay" onClick={confirmDialog.onCancel}>
          <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
            <p className="dialog-message">{confirmDialog.message}</p>
            <div className="dialog-buttons">
              <button onClick={confirmDialog.onConfirm} className="dialog-button confirm">
                確定
              </button>
              <button onClick={confirmDialog.onCancel} className="dialog-button cancel">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {!gameStarted && (
        <div className="start-screen">
          <h1 className="title">注音符號學習遊戲</h1>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="請輸入文章..."
            rows="10"
            cols="50"
          />
          <div className="story-buttons">
            {/* storageVersion triggers re-render when localStorage changes in other windows */}
            {allTexts.map((story, index) => {
              // Re-read score on each render (triggered by storageVersion change)
              const score = getTextScore(getTextKey(story));
              return (
                <button
                  key={`${index}-${storageVersion}`}
                  onClick={() => setInputText(story)}
                  className="story-button"
                >
                  {story.split('\n')[0]} ({score}分)
                </button>
              );
            })}
          </div>
          <button
            onClick={handleStartGame}
            className="start-button"
            disabled={!inputText.trim()}
          >
            開始遊戲
          </button>
        </div>
      )}

      {gameStarted && !isGameComplete && (
        <div className="game-screen">
          <div className="game-header">
            <div className="score-display">
              得分: {score} / {totalAttempts} ({accuracy}%)
            </div>
            <div className="progress-display">
              進度: {currentCharIndex + 1} / {characterList.length} ({progress}%)
            </div>
            <div className="hint-count-display">
              提示次數: {hintUsedCount}
            </div>
            <button onClick={resetGameState} className="restart-button">
              重新開始
            </button>
          </div>

          {/* Progress bar */}
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>

          {/* Display completed text + current character being selected (using Zhuyin font) */}
          <div className="completed-text-area" ref={completedTextRef}>
            <span className="completed-text">{text.substring(0, currentTextIndex)}</span>
            {currentWord && (
              <span className={`highlight ${feedback || ''}`}>{currentWord}</span>
            )}
          </div>

          <hr />

          {/* Scrambled character hints (using Zhuyin font) - hidden by default, shown on button click */}
          <div className="hint-section">
            {!showHint ? (
              <button onClick={handleShowHint} className="show-hint-button">
                💡 顯示提示
              </button>
            ) : (
              <div className="scrambledWords">{scrambledWords.join('')}</div>
            )}
          </div>

          {/* Choice options - display Chinese characters using regular font */}
          <div className="choice">
            {choiceOptions.map((word, index) => (
              <span
                key={`${word}-${index}`}
                onClick={() => handleWordClick(word)}
                className={`word ${feedback === 'correct' && word === currentWord ? 'correct' : ''}`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && handleWordClick(word)}
              >
                {index + 1}. {word}
              </span>
            ))}
          </div>

          <div className="hint">提示: 按數字鍵 1-{choiceOptions.length} 快速選擇</div>
        </div>
      )}

      {isGameComplete && (
        <div className="complete-screen">
          <h2>🎉 恭喜完成！</h2>
          <div className="final-score">
            <p>字數: {characterList.length}字</p>
            <p>答對: {score} / {totalAttempts} ({accuracy}%)</p>
            <p>使用提示次數: {hintUsedCount}</p>
            <p style={{ fontSize: '1.5em', fontWeight: 'bold', marginTop: '10px' }}>得分: {startScore}分</p>
            {lastEarnedScore !== null && (
              <p style={{ fontSize: '0.9em', color: '#93a1a1', marginTop: '5px' }}>
                （上次完成時: {lastEarnedScore}分）
              </p>
            )}
          </div>

          {/* Display incorrectly answered characters */}
          {wrongChars.length > 0 && (
            <div className="wrong-chars-section">
              <h3>❌ 答錯的字 ({wrongChars.length})</h3>
              <div className="char-list wrong-list">
                {wrongChars.map((char, index) => (
                  <span key={index} className="char-item wrong">{char}</span>
                ))}
              </div>
            </div>
          )}

          {/* Display characters where hint was used */}
          {hintUsedChars.length > 0 && (
            <div className="hint-chars-section">
              <h3>💡 用到提示的字 ({hintUsedChars.length})</h3>
              <div className="char-list hint-list">
                {hintUsedChars.map((char, index) => (
                  <span key={index} className="char-item hint">{char}</span>
                ))}
              </div>
            </div>
          )}
          
          <button onClick={resetGameState} className="restart-button">
            再玩一次
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
