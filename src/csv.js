import { getAllSyncRecords } from './syncLog';
import { HEADER_ROW, recordToRow } from './google';

// Quote a single CSV field when it contains a delimiter, quote, or newline,
// escaping embedded double-quotes per RFC 4180.
const escapeField = (value) => {
  const str = value == null ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toCsv = (rows) =>
  rows.map((row) => row.map(escapeField).join(',')).join('\r\n');

const pad = (n) => String(n).padStart(2, '0');

const dateStamp = (d = new Date()) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

// Build the CSV text (header + every locally-stored record) for the export.
export const buildCsvText = () => {
  const rows = [HEADER_ROW, ...getAllSyncRecords().map(recordToRow)];
  return toCsv(rows);
};

// How many records are available to export (for enabling/disabling the button).
export const getExportableCount = () => getAllSyncRecords().length;

// Trigger a client-side download of all local records as a CSV file. Prepends a
// UTF-8 BOM so Excel opens the Chinese content without mojibake.
export const exportRecordsToCsv = () => {
  const text = '﻿' + buildCsvText();
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bpmf-練習紀錄-${dateStamp()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
