import { useState, useEffect } from 'react';
import OAuthTab from './OAuthTab';
import AppsScriptTab from './AppsScriptTab';
import LocalDataTab from './LocalDataTab';
import { useSheetPicker } from './SheetPicker';

// Settings dialog shell: the gear button, open/close, and the tab bar. Each tab
// is a self-contained component that owns its own state and loads on mount.
function Settings({ onSyncChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('oauth'); // 'oauth' | 'appsscript' | 'local'
  // Owned here (not inside OAuthTab) so the picker dialog survives a tab switch
  // while an OAuth connect() is awaiting a spreadsheet choice.
  const { requestChoice, pickerElement } = useSheetPicker();

  useEffect(() => {
    if (isOpen) setActiveTab('oauth');
  }, [isOpen]);

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
              <OAuthTab onSyncChange={onSyncChange} requestChoice={requestChoice} />
            )}
            {activeTab === 'appsscript' && <AppsScriptTab onSyncChange={onSyncChange} />}
            {activeTab === 'local' && <LocalDataTab />}

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
