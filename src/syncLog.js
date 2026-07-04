const SYNC_LOG_KEY = 'bpmf_sync_log';

// Normalize any entry (including legacy boolean-synced entries) into the
// per-target shape: { id, record, synced: { [target]: isoTs } }.
const migrateEntry = (entry) => {
  if (entry && typeof entry.synced === 'object' && entry.synced !== null) {
    return { id: entry.id, record: entry.record, synced: entry.synced };
  }
  // Legacy: synced was a boolean. oauth was the only backend at that time.
  const synced = {};
  if (entry.synced === true) {
    synced.oauth = entry.syncedAt || new Date().toISOString();
  }
  return { id: entry.id, record: entry.record, synced };
};

const read = () => {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.map(migrateEntry);
  } catch {
    return [];
  }
};

const write = (entries) => {
  try {
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Failed to save sync log:', error);
  }
};

// Persist a completion record locally as unsynced. Dedups by completedAt.
export const appendSyncLog = (record) => {
  const entries = read();
  if (entries.some((e) => e.id === record.completedAt)) return entries;
  entries.push({ id: record.completedAt, record, synced: {} });
  write(entries);
  return entries;
};

// Mark a record as successfully uploaded to a specific backend target.
export const markSynced = (id, target) => {
  const entries = read();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.synced[target] = new Date().toISOString();
  write(entries);
};

// Records not yet synced to the given target, oldest first.
export const getUnsyncedFor = (target) =>
  read().filter((e) => !e.synced[target]);

// Number of records missing at least one of the currently-configured targets.
export const getPendingCount = (targetIds) =>
  read().filter((e) => targetIds.some((t) => !e.synced[t])).length;

// Every locally-stored completion record (synced and unsynced), oldest first.
// Used for the local CSV export, which is independent of cloud sync.
export const getAllSyncRecords = () => read().map((e) => e.record);
