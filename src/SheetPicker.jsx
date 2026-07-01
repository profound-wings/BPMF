import { useState, useCallback } from 'react';

const formatModified = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
};

function SheetPickerDialog({ candidates, onChoose }) {
  return (
    <div className="dialog-overlay sheet-picker-overlay" onClick={() => onChoose(null)}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <p className="dialog-message">找到多個既有的試算表，要用哪一個？</p>
        <div className="sheet-picker-list">
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              className="sheet-picker-item"
              onClick={() => onChoose(c.id)}
            >
              <span className="sheet-picker-name">{c.name}</span>
              <span className="sheet-picker-time">
                最後修改：{formatModified(c.modifiedTime)}
              </span>
              {c.url && (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sheet-picker-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  開啟 ↗
                </a>
              )}
            </button>
          ))}
        </div>
        <div className="dialog-buttons">
          <button
            type="button"
            onClick={() => onChoose('new')}
            className="dialog-button confirm"
          >
            建立新的
          </button>
          <button
            type="button"
            onClick={() => onChoose(null)}
            className="dialog-button cancel"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared picker for choosing among multiple existing spreadsheets.
// requestChoice(candidates) shows the dialog and resolves with a spreadsheetId,
// 'new', or null (cancelled).
export function useSheetPicker() {
  const [state, setState] = useState(null); // { candidates, resolve } | null

  const requestChoice = useCallback(
    (candidates) =>
      new Promise((resolve) => {
        setState({ candidates, resolve });
      }),
    []
  );

  const choose = (value) => {
    if (state) state.resolve(value);
    setState(null);
  };

  const pickerElement = state ? (
    <SheetPickerDialog candidates={state.candidates} onChoose={choose} />
  ) : null;

  return { requestChoice, pickerElement };
}
