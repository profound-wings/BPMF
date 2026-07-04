export const HEADER_ROW = [
  '開始時間',
  '完成時間',
  '故事',
  '得分',
  '答對',
  '字數',
  '答對率(%)',
  '提示次數',
  '答錯字',
  '用提示字',
];

// Map a completion record to a row aligned with HEADER_ROW. Shared by the
// Sheets upload, the Apps Script proxy, and the local CSV export so all stay
// in sync.
export const recordToRow = (record) => [
  record.startedAt,
  record.completedAt,
  record.textKey,
  record.earnedScore,
  record.score,
  record.charCount,
  record.accuracy,
  record.hintCount,
  record.wrongChars.join(''),
  record.hintUsedChars.join(''),
];
