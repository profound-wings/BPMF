const SYNC_LOG_KEY = 'bpmf_sync_log';

const read = () => {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    return raw ? JSON.parse(raw) : [];
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

// Persist a sheet-bound record locally as unsynced. Dedups by completedAt.
export const appendSyncLog = (record) => {
  const entries = read();
  if (entries.some((e) => e.id === record.completedAt)) return entries;
  entries.push({
    id: record.completedAt,
    record,
    synced: false,
    syncedAt: null,
  });
  write(entries);
  return entries;
};

// Mark a record as successfully uploaded.
export const markSynced = (id) => {
  const entries = read();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return;
  entry.synced = true;
  entry.syncedAt = new Date().toISOString();
  write(entries);
};

// Records that have not been uploaded yet, oldest first.
export const getUnsynced = () => read().filter((e) => !e.synced);

// Every locally-stored completion record (synced and unsynced), oldest first.
// Used for the local CSV export, which is independent of Google sync.
export const getAllSyncRecords = () => read().map((e) => e.record);
