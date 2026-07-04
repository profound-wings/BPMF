import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./google', () => ({
  appendCompletion: vi.fn(),
  isConfigured: vi.fn(),
}));
vi.mock('./appsScriptSync', () => ({
  sendRecord: vi.fn(),
  sendRecords: vi.fn(),
  hasAppsScriptConfig: vi.fn(),
}));
vi.mock('./syncLog', () => ({
  markSynced: vi.fn(),
  getUnsyncedFor: vi.fn(() => []),
  getPendingCount: vi.fn(() => 0),
}));

import { appendCompletion, isConfigured } from './google';
import { sendRecord, sendRecords, hasAppsScriptConfig } from './appsScriptSync';
import { markSynced, getUnsyncedFor } from './syncLog';
import { configuredTargets, syncRecord, resyncAll } from './sync';

const record = { completedAt: 'c1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('configuredTargets', () => {
  it('lists only configured backends', () => {
    isConfigured.mockReturnValue(true);
    hasAppsScriptConfig.mockReturnValue(false);
    expect(configuredTargets()).toEqual(['oauth']);
    isConfigured.mockReturnValue(false);
    hasAppsScriptConfig.mockReturnValue(true);
    expect(configuredTargets()).toEqual(['appsscript']);
  });
});

describe('syncRecord', () => {
  it('is idle when nothing configured', async () => {
    isConfigured.mockReturnValue(false);
    hasAppsScriptConfig.mockReturnValue(false);
    const res = await syncRecord(record);
    expect(res.overall).toBe('idle');
  });

  it('dual-writes and marks each on success', async () => {
    isConfigured.mockReturnValue(true);
    hasAppsScriptConfig.mockReturnValue(true);
    appendCompletion.mockResolvedValue({ skipped: false });
    sendRecord.mockResolvedValue({ skipped: false });

    const res = await syncRecord(record);
    expect(res.overall).toBe('success');
    expect(markSynced).toHaveBeenCalledWith('c1', 'oauth');
    expect(markSynced).toHaveBeenCalledWith('c1', 'appsscript');
  });

  it('prefers Apps Script error message on failure', async () => {
    isConfigured.mockReturnValue(true);
    hasAppsScriptConfig.mockReturnValue(true);
    appendCompletion.mockResolvedValue({ skipped: true, reason: 'token_unavailable' });
    sendRecord.mockResolvedValue({ skipped: true, reason: 'server_error', detail: 'bad sig' });

    const res = await syncRecord(record);
    expect(res.overall).toBe('error');
    expect(res.error).toContain('bad sig');
  });
});

describe('resyncAll', () => {
  it('backfills the Apps Script backlog in a single bulk request', async () => {
    const r1 = { completedAt: 'c1' };
    const r2 = { completedAt: 'c2' };
    isConfigured.mockReturnValue(false); // oauth off — isolate the batch path
    hasAppsScriptConfig.mockReturnValue(true);
    getUnsyncedFor.mockImplementation((t) =>
      t === 'appsscript'
        ? [{ id: 'c1', record: r1 }, { id: 'c2', record: r2 }]
        : []
    );
    sendRecords.mockResolvedValue({ skipped: false });

    const res = await resyncAll();
    // One HTTP call for the whole backlog, not one per record.
    expect(sendRecords).toHaveBeenCalledTimes(1);
    expect(sendRecords).toHaveBeenCalledWith([r1, r2]);
    expect(sendRecord).not.toHaveBeenCalled();
    expect(res.total).toBe(2);
    expect(res.synced).toBe(2);
    expect(res.failed).toBe(0);
    expect(markSynced).toHaveBeenCalledWith('c1', 'appsscript');
    expect(markSynced).toHaveBeenCalledWith('c2', 'appsscript');
  });

  it('counts the whole batch as failed and marks none when the bulk send is skipped', async () => {
    isConfigured.mockReturnValue(false);
    hasAppsScriptConfig.mockReturnValue(true);
    getUnsyncedFor.mockImplementation((t) =>
      t === 'appsscript' ? [{ id: 'c1', record }, { id: 'c2', record }] : []
    );
    sendRecords.mockResolvedValue({ skipped: true, reason: 'network_error' });

    const res = await resyncAll();
    expect(res.synced).toBe(0);
    expect(res.failed).toBe(2);
    expect(markSynced).not.toHaveBeenCalled();
  });

  it('still retries oauth per-record (no batch support)', async () => {
    isConfigured.mockReturnValue(true);
    hasAppsScriptConfig.mockReturnValue(false);
    getUnsyncedFor.mockImplementation((t) =>
      t === 'oauth' ? [{ id: 'c1', record }] : []
    );
    appendCompletion.mockResolvedValue({ skipped: false });

    const res = await resyncAll();
    expect(res.synced).toBe(1);
    expect(res.failed).toBe(0);
    expect(markSynced).toHaveBeenCalledWith('c1', 'oauth');
    expect(sendRecords).not.toHaveBeenCalled();
  });
});
