// BPMF 練習紀錄 — Apps Script Web App 寫入代理
// 部署：以「我」的身分執行、任何人可存取。
// Script Property：SECRET = 與兒童 App Settings 相同的 secret。

const HEADER_ROW = [
  '開始時間', '完成時間', '故事', '得分', '答對',
  '字數', '答對率(%)', '提示次數', '答錯字', '用提示字',
];

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const jwt = body.jwt;
    const record = body.record;
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret) return json_({ ok: false, error: '伺服器未設定 SECRET' });

    const payload = verifyJwt_(jwt, secret);
    if (!payload) return json_({ ok: false, error: '簽章無效' });

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) {
      return json_({ ok: false, error: 'JWT 已過期' });
    }

    const bh = sha256B64url_(stableStringify_(record));
    if (bh !== payload.bh) return json_({ ok: false, error: 'record 雜湊不符' });

    const child = String(payload.child || '').trim();
    if (!child) return json_({ ok: false, error: '缺少 child' });

    appendToChildSheet_(child, recordToRow_(record));
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function verifyJwt_(jwt, secret) {
  const parts = String(jwt || '').split('.');
  if (parts.length !== 3) return null;
  const signingInput = parts[0] + '.' + parts[1];
  const sigBytes = Utilities.computeHmacSha256Signature(signingInput, secret);
  const expected = bytesToB64url_(sigBytes);
  if (expected !== parts[2]) return null;
  return JSON.parse(b64urlToUtf8_(parts[1]));
}

function appendToChildSheet_(child, row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(child);
  if (!sheet) {
    sheet = ss.insertSheet(child);
    sheet.appendRow(HEADER_ROW);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_ROW);
  }
  sheet.appendRow(row);
}

function recordToRow_(r) {
  return [
    r.startedAt, r.completedAt, r.textKey, r.earnedScore, r.score,
    r.charCount, r.accuracy, r.hintCount,
    (r.wrongChars || []).join(''), (r.hintUsedChars || []).join(''),
  ];
}

// --- helpers: must match the browser client byte-for-byte ---

function stableStringify_(value) {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify_).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(function (k) {
      return JSON.stringify(k) + ':' + stableStringify_(value[k]);
    }).join(',') + '}';
  }
  return JSON.stringify(value);
}

function sha256B64url_(text) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8
  );
  return bytesToB64url_(bytes);
}

function bytesToB64url_(bytes) {
  return Utilities.base64Encode(bytes)
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToUtf8_(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bytes = Utilities.base64Decode(b64);
  return Utilities.newBlob(bytes).getDataAsString('UTF-8');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
