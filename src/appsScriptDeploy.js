// The Apps Script Web App source, bundled at build time so parents can download
// it straight from the Settings page — no need to hunt for it in the repo.
// Single source of truth: docs/apps-script/Code.gs (imported raw by Vite).
import codeGsSource from '../docs/apps-script/Code.gs?raw';

export const CODE_GS_SOURCE = codeGsSource;

// Trigger a client-side download of Code.gs.
export const downloadCodeGs = () => {
  const blob = new Blob([codeGsSource], { type: 'text/plain;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Code.gs';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the download has started before the blob URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
