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
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret) return reject_('伺服器未設定 SECRET');

    const payload = verifyJwt_(jwt, secret);
    if (!payload) return reject_('簽章無效');

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) {
      return reject_('JWT 已過期');
    }

    // Accept a batch (body.records: array) or a single record (body.record).
    // The bh in the JWT covers whichever the client sent, so hash the same
    // shape here. records[] is what actually gets written either way.
    var bhSource = Array.isArray(body.records) ? body.records : body.record;
    var records = Array.isArray(body.records)
      ? body.records
      : body.record ? [body.record] : [];
    if (!records.length) return reject_('缺少 record');

    const bh = sha256B64url_(stableStringify_(bhSource));
    if (bh !== payload.bh) return reject_('record 雜湊不符');

    const child = String(payload.child || '').trim();
    if (!child) return reject_('缺少 child');

    appendRowsToChildSheet_(child, records.map(recordToRow_));
    return json_({ ok: true, written: records.length });
  } catch (err) {
    // Log so exceptions (e.g. appendToChildSheet_ failing) are visible in the
    // Apps Script「執行項目 / Cloud 記錄」dashboard — the caught error is
    // otherwise invisible (run shows "completed", and the browser can't read
    // the response due to missing CORS headers).
    console.error('doPost 例外：' + (err && err.stack ? err.stack : String(err)));
    return json_({ ok: false, error: String(err) });
  }
}

// A validation refusal: log it (visible in the Executions dashboard) and
// return the error to the caller.
function reject_(message) {
  console.warn('拒絕寫入：' + message);
  return json_({ ok: false, error: message });
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

function appendRowsToChildSheet_(child, rows) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(child);
  if (!sheet) {
    sheet = ss.insertSheet(child);
    sheet.appendRow(HEADER_ROW);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_ROW);
  }
  if (!rows.length) return;
  // One block write for the whole batch instead of appendRow per row.
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
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
