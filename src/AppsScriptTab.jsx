import { useState, useEffect } from 'react';
import {
  getAppsScriptConfig,
  setAppsScriptConfig,
  hasAppsScriptConfig,
  generateSecret,
} from './appsScriptSync';
import { resyncAll, pendingCount } from './sync';
import { downloadCodeGs } from './appsScriptDeploy';

// Apps Script proxy sync tab: configure the parent-deployed Web App, generate a
// secret, download Code.gs, and read deployment steps — all without leaving the
// page.
function AppsScriptTab({ onSyncChange }) {
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [childName, setChildName] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);

  useEffect(() => {
    const cfg = getAppsScriptConfig();
    setUrl(cfg.url);
    setSecret(cfg.secret);
    setChildName(cfg.childName);
    setSaved(hasAppsScriptConfig());
    setPending(pendingCount());
  }, []);

  const handleSave = () => {
    setAppsScriptConfig({ url, secret, childName });
    setSaved(hasAppsScriptConfig());
    setPending(pendingCount());
  };

  const handleGenerate = () => {
    setSecret(generateSecret());
  };

  const handleResync = async () => {
    setBusy(true);
    setSyncNote('');
    try {
      const { failed, synced } = await resyncAll();
      setPending(pendingCount());
      if (failed > 0) setSyncNote(`⚠ 仍有 ${failed} 筆未同步`);
      else if (synced > 0) {
        setSyncNote(`✅ 已補傳 ${synced} 筆`);
        onSyncChange?.();
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCopySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setSecretCopied(true);
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      setSecretCopied(false);
    }
  };

  // Download + deploy steps only make sense once there's a secret to pair with.
  const hasSecret = Boolean(secret.trim());

  return (
    <>
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
            value={url}
            onChange={(e) => setUrl(e.target.value)}
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
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="按「產生 secret」或貼上"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <button type="button" className="settings-action-link" onClick={handleGenerate}>
          🔑 產生 secret
        </button>

        <label className="settings-label">
          這台裝置的小孩名
          <input
            type="text"
            className="settings-input"
            value={childName}
            onChange={(e) => setChildName(e.target.value)}
            placeholder="例如：小明"
            autoComplete="off"
          />
        </label>

        <div className="settings-inline-buttons">
          <button type="button" onClick={handleSave} className="dialog-button confirm">
            儲存
          </button>
        </div>

        {hasSecret && (
          <div className="settings-inline-buttons settings-deploy-actions">
            <button type="button" onClick={downloadCodeGs} className="dialog-button confirm">
              ⬇ 下載 Code.gs
            </button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="dialog-button cancel"
            >
              📖 部署說明
            </button>
          </div>
        )}

        {saved && pending > 0 && (
          <div className="settings-unsynced">
            <span>⚠ 有 {pending} 筆未同步（資料已存於本地）</span>
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
      </section>

      {showHelp && (
        <div
          className="dialog-overlay apps-help-overlay"
          onClick={() => setShowHelp(false)}
        >
          <div className="dialog-box settings-dialog" onClick={(e) => e.stopPropagation()}>
            <h2 className="settings-title">Apps Script 部署步驟</h2>
            <p className="settings-description">
              一次性設定，之後兒童裝置不需再登入。
            </p>
            <ol className="settings-help">
              <li>開啟你要存資料的 Google 試算表（或新建一個）。</li>
              <li>選單「擴充功能 → Apps Script」。</li>
              <li>
                按下方「下載 Code.gs」，把檔案內容整份貼進編輯器，儲存。
                <div className="settings-inline-buttons" style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={downloadCodeGs}
                    className="dialog-button confirm"
                  >
                    ⬇ 下載 Code.gs
                  </button>
                </div>
              </li>
              <li>
                左側「專案設定 ⚙ → 指令碼屬性」新增一筆：屬性名稱填{' '}
                <code className="settings-code">SECRET</code>，值填下面這個 secret：
                <div className="settings-secret-box">
                  <code className="settings-secret-value">{secret}</code>
                  <button
                    type="button"
                    onClick={handleCopySecret}
                    className="dialog-button confirm"
                  >
                    {secretCopied ? '已複製 ✓' : '複製'}
                  </button>
                </div>
              </li>
              <li>
                右上「部署 → 新增部署作業 → 類型選『網頁應用程式』」：執行身分選「我」、誰可以存取選「任何人」。
              </li>
              <li>複製產生的「網頁應用程式 URL」，貼回上方的 Web App URL 欄，按「儲存」。</li>
              <li>在 App 完成一次故事，回試算表確認出現以小孩名為名的分頁與資料列。</li>
            </ol>
            <p className="settings-description">
              更新 Code.gs 後要「管理部署作業 → 編輯 → 版本選『新版本』」才會生效。secret 若外洩，重新產生並同步更新這裡與指令碼屬性即可。
            </p>
            <div className="dialog-buttons">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="dialog-button cancel"
              >
                關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default AppsScriptTab;
