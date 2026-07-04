import { useState, useEffect } from 'react';
import { exportRecordsToCsv, getExportableCount } from './csv';

// Local data tab: export every locally-stored record as CSV, no cloud needed.
function LocalDataTab() {
  const [exportCount, setExportCount] = useState(0);

  useEffect(() => {
    setExportCount(getExportableCount());
  }, []);

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">本地資料</h3>
      <p className="settings-description">
        把所有練習紀錄（含未同步）匯出成 CSV，不需連結 Google。
      </p>
      <button
        type="button"
        onClick={exportRecordsToCsv}
        className="dialog-button confirm"
        disabled={exportCount === 0}
      >
        ⬇ 匯出 CSV{exportCount > 0 ? `（${exportCount} 筆）` : ''}
      </button>
    </section>
  );
}

export default LocalDataTab;
