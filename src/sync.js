import { appendCompletion, isConfigured as oauthConfigured } from './google';
import { sendRecord, hasAppsScriptConfig } from './appsScriptSync';
import { markSynced, getUnsyncedFor, getPendingCount } from './syncLog';

// Backend targets in priority order for error reporting: Apps Script first,
// so its message wins when both fail ("以 Apps Script 為準").
const TARGETS = [
  { id: 'appsscript', isConfigured: hasAppsScriptConfig, send: sendRecord },
  { id: 'oauth', isConfigured: oauthConfigured, send: appendCompletion },
];

export const TARGET_IDS = TARGETS.map((t) => t.id);

const reasonToMessage = (target, result) => {
  if (target.id === 'appsscript') {
    return `Apps Script 同步失敗：${result.detail || result.reason}`;
  }
  if (result.reason === 'token_unavailable') return 'Google 連結已過期';
  if (result.reason === 'client_id_mismatch') return '帳號連結與目前 Client ID 不符';
  return `Google 同步失敗：${result.reason}`;
};

export const configuredTargets = () =>
  TARGETS.filter((t) => t.isConfigured()).map((t) => t.id);

// Send a record to every configured backend. Marks each target synced on
// success. overall: idle (none configured) / success (all ok) / error (any failed).
export const syncRecord = async (record) => {
  const active = TARGETS.filter((t) => t.isConfigured());
  if (active.length === 0) return { overall: 'idle', perTarget: {} };

  const perTarget = {};
  let error = '';
  for (const target of active) {
    let result;
    try {
      result = await target.send(record);
    } catch (err) {
      result = { skipped: true, reason: 'exception', detail: err.message };
    }
    if (!result.skipped) {
      markSynced(record.completedAt, target.id);
      perTarget[target.id] = { ok: true };
    } else {
      perTarget[target.id] = { ok: false, reason: result.reason, detail: result.detail };
      // TARGETS is Apps-Script-first, so the first failure sets the message
      // and later (oauth) failures do not overwrite it.
      if (!error) error = reasonToMessage(target, result);
    }
  }

  const overall = Object.values(perTarget).every((r) => r.ok) ? 'success' : 'error';
  return { overall, perTarget, error };
};

// Retry every locally-unsynced record against each configured target, only
// for the targets that record still misses.
export const resyncAll = async () => {
  const active = TARGETS.filter((t) => t.isConfigured());
  let synced = 0;
  let failed = 0;
  const attempted = new Set();
  for (const target of active) {
    for (const entry of getUnsyncedFor(target.id)) {
      attempted.add(entry.id);
      let result;
      try {
        result = await target.send(entry.record);
      } catch {
        result = { skipped: true };
      }
      if (!result.skipped) {
        markSynced(entry.id, target.id);
      }
    }
  }
  // Recompute outcome from remaining pending count over configured targets.
  const ids = active.map((t) => t.id);
  const remaining = getPendingCount(ids);
  synced = attempted.size - remaining;
  failed = remaining;
  return { total: attempted.size, synced: Math.max(0, synced), failed };
};

export const pendingCount = () => getPendingCount(configuredTargets());
