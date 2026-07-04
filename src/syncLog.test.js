import { describe, it, expect } from 'vitest';
import {
  appendSyncLog,
  markSynced,
  getUnsyncedFor,
  getPendingCount,
  getAllSyncRecords,
} from './syncLog';

const KEY = 'bpmf_sync_log';
const rec = (id) => ({
  textKey: 't',
  startedAt: id,
  completedAt: id,
  earnedScore: 1,
  score: 1,
  charCount: 1,
  accuracy: 100,
  hintCount: 0,
  wrongChars: [],
  hintUsedChars: [],
});

describe('syncLog per-target', () => {
  it('appends with empty synced map and dedups by completedAt', () => {
    appendSyncLog(rec('a'));
    appendSyncLog(rec('a'));
    const raw = JSON.parse(localStorage.getItem(KEY));
    expect(raw).toHaveLength(1);
    expect(raw[0].synced).toEqual({});
  });

  it('markSynced records per target', () => {
    appendSyncLog(rec('a'));
    markSynced('a', 'oauth');
    expect(getUnsyncedFor('oauth')).toHaveLength(0);
    expect(getUnsyncedFor('appsscript')).toHaveLength(1);
  });

  it('getPendingCount counts entries missing any configured target', () => {
    appendSyncLog(rec('a'));
    markSynced('a', 'oauth');
    expect(getPendingCount(['oauth'])).toBe(0);
    expect(getPendingCount(['oauth', 'appsscript'])).toBe(1);
  });

  it('migrates legacy boolean synced:true to oauth', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: 'old', record: rec('old'), synced: true, syncedAt: '2026-01-01T00:00:00.000Z' },
      ])
    );
    expect(getUnsyncedFor('oauth')).toHaveLength(0);
    expect(getUnsyncedFor('appsscript')).toHaveLength(1);
    expect(getAllSyncRecords()).toHaveLength(1);
  });

  it('migrates legacy boolean synced:false to empty map', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([{ id: 'old', record: rec('old'), synced: false, syncedAt: null }])
    );
    expect(getUnsyncedFor('oauth')).toHaveLength(1);
  });
});
