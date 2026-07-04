import { describe, it, expect } from 'vitest';
import { HEADER_ROW, recordToRow } from './sheetFormat';

const sample = {
  textKey: '小故事',
  startedAt: '2026-07-03T00:00:00.000Z',
  completedAt: '2026-07-03T00:05:00.000Z',
  earnedScore: 10,
  score: 3,
  charCount: 12,
  accuracy: 90,
  hintCount: 1,
  wrongChars: ['錯', '字'],
  hintUsedChars: ['提'],
  pauseCount: 2,
  pauseDetails: '上廁所(45秒); 喝水(20秒)',
};

describe('sheetFormat', () => {
  it('HEADER_ROW has 12 columns starting with 開始時間', () => {
    expect(HEADER_ROW).toHaveLength(12);
    expect(HEADER_ROW[0]).toBe('開始時間');
    expect(HEADER_ROW[10]).toBe('暫停次數');
    expect(HEADER_ROW[11]).toBe('暫停明細');
  });

  it('recordToRow aligns with HEADER_ROW and joins char arrays', () => {
    const row = recordToRow(sample);
    expect(row).toHaveLength(HEADER_ROW.length);
    expect(row[0]).toBe('2026-07-03T00:00:00.000Z');
    expect(row[2]).toBe('小故事');
    expect(row[8]).toBe('錯字');
    expect(row[9]).toBe('提');
    expect(row[10]).toBe(2);
    expect(row[11]).toBe('上廁所(45秒); 喝水(20秒)');
  });

  it('recordToRow defaults pause fields for old records', () => {
    const { pauseCount, pauseDetails, ...old } = sample;
    const row = recordToRow(old);
    expect(row[10]).toBe(0);
    expect(row[11]).toBe('');
  });
});
