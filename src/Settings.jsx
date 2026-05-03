import { useState, useEffect } from 'react';
import { connect, disconnect, readSession } from './google';

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

function Settings() {
  const [isOpen, setIsOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [savedClientId, setSavedClientId] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [session, setSession] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      const current = getGoogleClientId();
      setClientId(current);
      setSavedClientId(current);
      setSession(readSession());
      setShowHelp(false);
      setError('');
      setBusy(false);
    }
  }, [isOpen]);

  const dirty = clientId.trim() !== savedClientId;
  const connected = sessionMatchesClientId(session, savedClientId);

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
    try {
      const newSession = await connect();
      setSession(newSession);
    } catch (e) {
      setError(e.message || '連結失敗');
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
      <button
        className="settings-gear"
        onClick={() => setIsOpen(true)}
        aria-label="設定"
        title="設定"
      >
        ⚙
      </button>

      {isOpen && (
        <div className="dialog-overlay" onClick={() => setIsOpen(false)}>
          <div
            className="dialog-box settings-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="settings-title">設定</h2>

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
                  <li>APIs &amp; Services → Library，啟用「Google Sheets API」</li>
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
                  <div className="settings-connected">
                    <p className="settings-connected-status">✅ 已連結 Google</p>
                    <a
                      href={session.spreadsheetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="settings-sheet-link"
                    >
                      開啟試算表 ↗
                    </a>
                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="dialog-button cancel"
                      disabled={busy}
                    >
                      {busy ? '處理中…' : '中斷連結'}
                    </button>
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
