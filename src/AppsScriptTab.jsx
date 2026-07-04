import { useState, useEffect } from 'react';
import {
  getAppsScriptConfig,
  setAppsScriptConfig,
  hasAppsScriptConfig,
  generateSecret,
} from './appsScriptSync';
import { resyncAll, pendingCount } from './sync';
import { downloadCodeGs } from './appsScriptDeploy';

// Apps Script proxy sync tab. Guided in setup order: generate a secret first,
// then (collapsed by default) download Code.gs + deploy steps, then — only once
// a secret exists — the Web App URL and this device's child name.
function AppsScriptTab({ onSyncChange }) {
  const [url, setUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [childName, setChildName] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(0);
  const [busy, setBusy] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [showDeploy, setShowDeploy] = useState(false);
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

  // The secret is the anchor: deploy steps and the Web App / child-name fields
  // only make sense once one exists.
  const hasSecret = Boolean(secret.trim());

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Apps Script 同步</h3>
      <p className="settings-description">
        兒童裝置不需登入 Google。由家長部署一個 Apps Script Web App，資料以你的身分寫入試算表。多個小孩會各自寫進以小孩名為名的分頁。
      </p>

      {/* Step 1 — secret */}
      <label className="settings-label">
        1. Secret
        <div className="settings-input-row">
          <input
            type="text"
            className="settings-input"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="按「產生」或貼上"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="dialog-button confirm" onClick={handleGenerate}>
            🔑 產生
          </button>
          <button
            type="button"
            className="dialog-button cancel"
            onClick={handleCopySecret}
            disabled={!hasSecret}
          >
            {secretCopied ? '已複製 ✓' : '複製'}
          </button>
        </div>
      </label>

      {hasSecret && (
        <>
          {/* Step 2 — same labeled format as the others; the expand/collapse
              toggle sits at the end of the block as its control. */}
          <div className="settings-label">
            2. 下載 Code.gs 與部署說明
            <button
              type="button"
              className="settings-help-toggle"
              onClick={() => setShowDeploy((v) => !v)}
            >
              {showDeploy ? '▼ 收合' : '▶ 展開'}
            </button>
          </div>

          {showDeploy && (
            <div className="settings-deploy-block">
              <div className="settings-inline-buttons">
                <button
                  type="button"
                  onClick={downloadCodeGs}
                  className="dialog-button confirm"
                >
                  ⬇ 下載 Code.gs
                </button>
              </div>
              <ol className="settings-help">
                <li>開啟你要存資料的 Google 試算表（或新建一個）。</li>
                <li>選單「擴充功能 → Apps Script」。</li>
                <li>按上方「下載 Code.gs」，把檔案內容整份貼進編輯器，儲存。</li>
                <li>
                  左側「專案設定 ⚙ → 指令碼屬性」新增一筆：屬性名稱填{' '}
                  <code className="settings-code">SECRET</code>，值填上面第 1 步的 secret（用「複製」鍵複製）。
                </li>
                <li>
                  右上「部署 → 新增部署作業 → 類型選『網頁應用程式』」：執行身分選「我」、誰可以存取選「任何人」。
                </li>
                <li>複製產生的「網頁應用程式 URL」，填進下方的 Web App URL 欄。</li>
                <li>填好小孩名並「儲存」，完成一次故事後回試算表確認出現以小孩名為名的分頁。</li>
              </ol>
              <p className="settings-description">
                更新 Code.gs 後要「管理部署作業 → 編輯 → 版本選『新版本』」才會生效。secret 若外洩，重新產生並同步更新這裡與指令碼屬性即可。
              </p>
            </div>
          )}

          {/* Step 3 — Web App URL + child name (only after a secret exists) */}
          <label className="settings-label">
            3. Web App URL
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
            4. 這台裝置的小孩名
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
        </>
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
  );
}

export default AppsScriptTab;
