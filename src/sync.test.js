import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./google', () => ({
  appendCompletion: vi.fn(),
  isConfigured: vi.fn(),
}));
vi.mock('./appsScriptSync', () => ({
  sendRecord: vi.fn(),
  hasAppsScriptConfig: vi.fn(),
}));
vi.mock('./syncLog', () => ({
  markSynced: vi.fn(),
  getUnsyncedFor: vi.fn(() => []),
  getPendingCount: vi.fn(() => 0),
}));

import { appendCompletion, isConfigured } from './google';
import { sendRecord, hasAppsScriptConfig } from './appsScriptSync';
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
  it('retries only missing targets per entry', async () => {
    isConfigured.mockReturnValue(true);
    hasAppsScriptConfig.mockReturnValue(true);
    getUnsyncedFor.mockImplementation((t) =>
      t === 'appsscript' ? [{ id: 'c1', record }] : []
    );
    sendRecord.mockResolvedValue({ skipped: false });

    const res = await resyncAll();
    expect(res.synced).toBe(1);
    expect(res.failed).toBe(0);
    expect(markSynced).toHaveBeenCalledWith('c1', 'appsscript');
    expect(appendCompletion).not.toHaveBeenCalled();
  });
});
