import { useState, useEffect } from 'react';
import { connect, disconnect, readSession, refreshSession } from './google';
import { getGoogleClientId, writeConfig } from './settingsConfig';
import { resyncAll, pendingCount } from './sync';
import { useSheetPicker } from './SheetPicker';

const sessionMatchesClientId = (session, clientId) =>
  Boolean(session && session.clientId === clientId && session.spreadsheetId);

const formatRemaining = (ms) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes <= 0) return '剩不到 1 分鐘';
  return `剩 ${minutes} 分鐘`;
};

// Google OAuth sync tab: Client ID entry + account link/refresh/disconnect.
function OAuthTab({ onSyncChange }) {
  const [clientId, setClientId] = useState('');
  const [savedClientId, setSavedClientId] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [syncNote, setSyncNote] = useState('');
  const { requestChoice, pickerElement } = useSheetPicker();

  useEffect(() => {
    const current = getGoogleClientId();
    setClientId(current);
    setSavedClientId(current);
    setSession(readSession());
    setUnsyncedCount(pendingCount());
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // Push any locally-unsynced records, then refresh the pending count and note.
  const runResync = async () => {
    const { failed, synced } = await resyncAll();
    setUnsyncedCount(pendingCount());
    if (failed > 0) {
      setSyncNote(`⚠ 仍有 ${failed} 筆未同步`);
    } else if (synced > 0) {
      setSyncNote(`✅ 已補傳 ${synced} 筆`);
    }
    if (synced > 0) onSyncChange?.();
  };

  const dirty = clientId.trim() !== savedClientId;
  const connected = sessionMatchesClientId(session, savedClientId);
  const expiresAt = session?.expiresAt || 0;
  const remainingMs = expiresAt - now;
  const isExpired = !expiresAt || remainingMs <= 0;

  const handleSave = () => {
    const trimmed = clientId.trim();
    writeConfig(trimmed ? { clientId: trimmed } : {});
    setSavedClientId(trimmed);
    if (!trimmed) {
      disconnect();
      setSession(null);
    }
  };

  const handleClear = () => {
    setClientId('');
    writeConfig({});
    setSavedClientId('');
    disconnect();
    setSession(null);
  };

  const handleConnect = async () => {
    setBusy(true);
    setError('');
    setSyncNote('');
    try {
      const newSession = await connect({ onMultiple: requestChoice });
      setSession(newSession);
      await runResync();
    } catch (e) {
      setError(e.message || '連結失敗');
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setBusy(true);
    setError('');
    setSyncNote('');
    try {
      const refreshed = await refreshSession();
      setSession(refreshed);
      setNow(Date.now());
      await runResync();
    } catch (e) {
      setError(e.message || '更新失敗，請改用「重新連結」');
    } finally {
      setBusy(false);
    }
  };

  const handleResync = async () => {
    setBusy(true);
    setError('');
    setSyncNote('');
    try {
      await runResync();
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    setError('');
    try {
      await disconnect();
      setSession(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {pickerElement}

      <section className="settings-section">
        <h3 className="settings-section-title">Google Sheets 同步</h3>
        <p className="settings-description">
          填入你自己的 Google OAuth Client ID 即可啟用同步。資料存在你自己的試算表，不會經過第三方伺服器。留空則保持純本地模式。
        </p>

        <label className="settings-label">
          Client ID
          <input
            type="text"
            className="settings-input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxxxxx.apps.googleusercontent.com"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className="settings-inline-buttons">
          <button
            type="button"
            onClick={handleSave}
            className="dialog-button confirm"
            disabled={!dirty}
          >
            儲存 Client ID
          </button>
          {savedClientId && (
            <button type="button" onClick={handleClear} className="dialog-button cancel">
              清除 Client ID
            </button>
          )}
        </div>

        <button
          type="button"
          className="settings-help-toggle"
          onClick={() => setShowHelp((v) => !v)}
        >
          {showHelp ? '▼' : '▶'} 如何取得 Client ID？
        </button>

        {showHelp && (
          <ol className="settings-help">
            <li>
              開啟{' '}
              <a
                href="https://console.cloud.google.com/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Google Cloud Console
              </a>{' '}
              並建立新 project
            </li>
            <li>APIs &amp; Services → Library，啟用「Google Sheets API」與「Google Drive API」</li>
            <li>
              OAuth consent screen 選 External，填基本資料即可（不需送審，用 Testing 模式就好）
            </li>
            <li>Credentials → Create Credentials → OAuth Client ID，類型選 Web application</li>
            <li>
              Authorized JavaScript origins 加入：
              <code className="settings-code">{window.location.origin}</code>
              （dev 跟 prod 的 origin 不同，記得各自加入）
            </li>
            <li>複製 Client ID，貼到上方欄位後按「儲存 Client ID」</li>
          </ol>
        )}
      </section>

      {savedClientId && (
        <section className="settings-section">
          <h3 className="settings-section-title">Google 帳號</h3>
          {dirty && (
            <p className="settings-warning">
              Client ID 已修改但尚未儲存，請先儲存才能連結帳號。
            </p>
          )}
          {connected ? (
            <div
              className={`settings-connected ${
                isExpired ? 'settings-connected--expired' : ''
              }`}
            >
              <p
                className={`settings-connected-status ${
                  isExpired ? 'settings-connected-status--expired' : ''
                }`}
              >
                {isExpired
                  ? '❌ 連結已過期'
                  : `✅ 已連結 Google（${formatRemaining(remainingMs)}）`}
              </p>
              {session.email && (
                <p className="settings-connected-email">{session.email}</p>
              )}
              <a
                href={session.spreadsheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="settings-sheet-link"
              >
                開啟試算表 ↗
              </a>
              <div className="settings-inline-buttons">
                {isExpired ? (
                  <button
                    type="button"
                    onClick={handleConnect}
                    className="dialog-button confirm"
                    disabled={busy || dirty}
                  >
                    {busy ? '連結中…' : '🔗 重新連結'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRefresh}
                    className="dialog-button confirm"
                    disabled={busy || dirty}
                    title="不跳 popup，直接延長有效期"
                  >
                    {busy ? '更新中…' : '🔄 更新 token'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="dialog-button cancel"
                  disabled={busy}
                >
                  {busy ? '處理中…' : '中斷連結'}
                </button>
              </div>
              {unsyncedCount > 0 && (
                <div className="settings-unsynced">
                  <span>⚠ 有 {unsyncedCount} 筆未同步（資料已存於本地）</span>
                  <button
                    type="button"
                    onClick={handleResync}
                    className="dialog-button confirm"
                    disabled={busy}
                  >
                    {busy ? '補傳中…' : '補傳未同步'}
                  </button>
                </div>
              )}
              {syncNote && <p className="settings-sync-note">{syncNote}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConnect}
              className="google-link-button"
              disabled={busy || dirty}
            >
              {busy ? '連結中…' : '🔗 連結 Google 帳號'}
            </button>
          )}
          {error && <p className="settings-error">{error}</p>}
        </section>
      )}
    </>
  );
}

export default OAuthTab;
