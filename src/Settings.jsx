import { useState, useEffect } from 'react';
import {
  connect,
  disconnect,
  readSession,
  refreshSession,
} from './google';
import { exportRecordsToCsv, getExportableCount } from './csv';
import { useSheetPicker } from './SheetPicker';
import {
  getAppsScriptConfig,
  setAppsScriptConfig,
  hasAppsScriptConfig,
  generateSecret,
} from './appsScriptSync';
import { resyncAll, pendingCount } from './sync';

const CONFIG_KEY = 'bpmf_google_config';

const readConfig = () => {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeConfig = (config) => {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (error) {
    console.error('Failed to save Google config:', error);
  }
};

export const getGoogleClientId = () => {
  const id = readConfig().clientId;
  return typeof id === 'string' ? id.trim() : '';
};

export const hasGoogleClientId = () => Boolean(getGoogleClientId());

const sessionMatchesClientId = (session, clientId) =>
  Boolean(session && session.clientId === clientId && session.spreadsheetId);

const formatRemaining = (ms) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes <= 0) return '剩不到 1 分鐘';
  return `剩 ${minutes} 分鐘`;
};

function Settings({ onSyncChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [savedClientId, setSavedClientId] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [unsyncedCount, setUnsyncedCount] = useState(0);
  const [exportCount, setExportCount] = useState(0);
  const [syncNote, setSyncNote] = useState('');
  const [activeTab, setActiveTab] = useState('oauth'); // 'oauth' | 'appsscript' | 'local'
  const [asUrl, setAsUrl] = useState('');
  const [asSecret, setAsSecret] = useState('');
  const [asChild, setAsChild] = useState('');
  const [asSaved, setAsSaved] = useState(false);
  const [asPending, setAsPending] = useState(0);
  const { requestChoice, pickerElement } = useSheetPicker();

  useEffect(() => {
    if (!isOpen) return;
    const current = getGoogleClientId();
    setClientId(current);
    setSavedClientId(current);
    setSession(readSession());
    setShowHelp(false);
    setError('');
    setBusy(false);
    setNow(Date.now());
    setUnsyncedCount(pendingCount());
    setExportCount(getExportableCount());
    setSyncNote('');

    const asCfg = getAppsScriptConfig();
    setAsUrl(asCfg.url);
    setAsSecret(asCfg.secret);
    setAsChild(asCfg.childName);
    setAsSaved(hasAppsScriptConfig());
    setAsPending(pendingCount());
    setActiveTab('oauth');

    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, [isOpen]);

  // Push any locally-unsynced records, then refresh the pending count and note.
  const runResync = async () => {
    const { failed, synced } = await resyncAll();
    setUnsyncedCount(pendingCount());
    if (failed > 0) {
      setSyncNote(`⚠ 仍有 ${failed} 筆未同步`);
    } else if (synced > 0) {
      setSyncNote(`✅ 已補傳 ${synced} 筆`);
    }
    // Notify the parent so the finish-screen sync status recomputes and drops
    // its stale "重新連結並補傳全部" prompt.
    if (synced > 0) onSyncChange?.();
  };

  const handleAsSave = () => {
    setAppsScriptConfig({ url: asUrl, secret: asSecret, childName: asChild });
    setAsSaved(hasAppsScriptConfig());
    setAsPending(pendingCount());
  };

  const handleAsGenerate = () => {
    setAsSecret(generateSecret());
  };

  const handleAsResync = async () => {
    setBusy(true);
    setSyncNote('');
    try {
      const { failed, synced } = await resyncAll();
      setAsPending(pendingCount());
      setUnsyncedCount(pendingCount());
      if (failed > 0) setSyncNote(`⚠ 仍有 ${failed} 筆未同步`);
      else if (synced > 0) {
        setSyncNote(`✅ 已補傳 ${synced} 筆`);
        onSyncChange?.();
      }
    } finally {
      setBusy(false);
    }
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
      // clearing Client ID also clears any session
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
      await runResync(); // backfill any unsynced records with the fresh token
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
      await runResync(); // backfill any unsynced records with the fresh token
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

  const handleExport = () => {
    exportRecordsToCsv();
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
      <button
        className="settings-gear"
        onClick={() => setIsOpen(true)}
        aria-label="設定"
        title="設定"
      >
        ⚙
      </button>

      {pickerElement}

      {isOpen && (
        <div className="dialog-overlay" onClick={() => setIsOpen(false)}>
          <div
            className="dialog-box settings-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="settings-title">設定</h2>

            <div className="settings-tabs">
              <button
                className={`settings-tab ${activeTab === 'oauth' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('oauth')}
              >
                Google OAuth
              </button>
              <button
                className={`settings-tab ${activeTab === 'appsscript' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('appsscript')}
              >
                Apps Script 同步
              </button>
              <button
                className={`settings-tab ${activeTab === 'local' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('local')}
              >
                本地資料
              </button>
            </div>

            {activeTab === 'oauth' && (
              <>
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
                  <button
                    type="button"
                    onClick={handleClear}
                    className="dialog-button cancel"
                  >
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
                    OAuth consent screen 選 External，填基本資料即可（不需送審，用 Testing
                    模式就好）
                  </li>
                  <li>
                    Credentials → Create Credentials → OAuth Client ID，類型選 Web application
                  </li>
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
                        <span>
                          ⚠ 有 {unsyncedCount} 筆未同步（資料已存於本地）
                        </span>
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
            )}

            {activeTab === 'appsscript' && (
              <section className="settings-section">
                <h3 className="settings-section-title">Apps Script 同步</h3>
                <p className="settings-description">
                  兒童裝置不需登入 Google。由家長部署一個 Apps Script Web App，資料以你的身分寫入試算表。多個小孩會各自寫進以小孩名為名的分頁。
                </p>

                <label className="settings-label">
                  Web App URL
                  <input
                    type="text"
                    className="settings-input"
                    value={asUrl}
                    onChange={(e) => setAsUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/..../exec"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>

                <label className="settings-label">
                  Secret
                  <input
                    type="text"
                    className="settings-input"
                    value={asSecret}
                    onChange={(e) => setAsSecret(e.target.value)}
                    placeholder="按「產生 secret」或貼上"
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
                <button type="button" className="settings-help-toggle" onClick={handleAsGenerate}>
                  🔑 產生 secret
                </button>

                <label className="settings-label">
                  這台裝置的小孩名
                  <input
                    type="text"
                    className="settings-input"
                    value={asChild}
                    onChange={(e) => setAsChild(e.target.value)}
                    placeholder="例如：小明"
                    autoComplete="off"
                  />
                </label>

                <div className="settings-inline-buttons">
                  <button type="button" onClick={handleAsSave} className="dialog-button confirm">
                    儲存
                  </button>
                </div>

                {asSaved && asPending > 0 && (
                  <div className="settings-unsynced">
                    <span>⚠ 有 {asPending} 筆未同步（資料已存於本地）</span>
                    <button
                      type="button"
                      onClick={handleAsResync}
                      className="dialog-button confirm"
                      disabled={busy}
                    >
                      {busy ? '補傳中…' : '補傳未同步'}
                    </button>
                  </div>
                )}
                {syncNote && <p className="settings-sync-note">{syncNote}</p>}

                <p className="settings-description" style={{ marginTop: '1rem' }}>
                  部署步驟與 Code.gs 請見專案的 <code className="settings-code">docs/apps-script/</code>。secret 要和 Apps Script 的指令碼屬性 SECRET 一致。
                </p>
              </section>
            )}

            {activeTab === 'local' && (
            <section className="settings-section">
              <h3 className="settings-section-title">本地資料</h3>
              <p className="settings-description">
                把所有練習紀錄（含未同步）匯出成 CSV，不需連結 Google。
              </p>
              <button
                type="button"
                onClick={handleExport}
                className="dialog-button confirm"
                disabled={exportCount === 0}
              >
                ⬇ 匯出 CSV{exportCount > 0 ? `（${exportCount} 筆）` : ''}
              </button>
            </section>
            )}

            <div className="dialog-buttons">
              <button onClick={() => setIsOpen(false)} className="dialog-button cancel">
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Settings;
