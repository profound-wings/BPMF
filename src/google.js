import { getGoogleClientId } from './settingsConfig';
import { HEADER_ROW, recordToRow } from './sheetFormat';
export { HEADER_ROW, recordToRow };

const SESSION_KEY = 'bpmf_google_session';
const SCOPE =
  'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly https://www.googleapis.com/auth/userinfo.email';
const SPREADSHEET_TITLE = 'BPMF 練習紀錄';
export const TOKEN_REFRESH_BUFFER_MS = 60_000;

export const readSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeSession = (session) => {
  if (session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
};

const waitForGsi = async () => {
  if (window.google?.accounts?.oauth2) return;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (window.google?.accounts?.oauth2) return;
  }
  throw new Error('Google Identity Services 載入失敗，請確認網路連線');
};

const requestAccessToken = async ({ silent, hint }) => {
  await waitForGsi();
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error('尚未設定 Client ID');

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      hint: hint || undefined,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }
        // Ensure the user granted every scope we need. A partial grant (e.g.
        // unchecking Sheets in the consent screen) otherwise causes a confusing
        // 403 ACCESS_TOKEN_SCOPE_INSUFFICIENT downstream.
        const oauth2 = window.google?.accounts?.oauth2;
        const required = SCOPE.split(' ');
        if (
          oauth2?.hasGrantedAllScopes &&
          !oauth2.hasGrantedAllScopes(response, ...required)
        ) {
          reject(new Error('請允許所有要求的權限（Google Sheets 與 Drive）後再連結'));
          return;
        }
        resolve(response);
      },
      error_callback: (err) => {
        reject(new Error(err.message || err.type || '授權失敗'));
      },
    });
    // Interactive connect forces the consent screen so newly-added scopes are
    // always granted; silent refresh stays prompt-less.
    tokenClient.requestAccessToken(silent ? { prompt: '' } : { prompt: 'consent' });
  });
};

const fetchUserEmail = async (accessToken) => {
  try {
    const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.email || null;
  } catch {
    return null;
  }
};

const createSpreadsheet = async (accessToken) => {
  const resp = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: { title: SPREADSHEET_TITLE } }),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`建立試算表失敗 (${resp.status})：${detail}`);
  }
  const data = await resp.json();
  return { id: data.spreadsheetId, url: data.spreadsheetUrl };
};

const verifySpreadsheet = async (accessToken, spreadsheetId) => {
  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) return null;
  const data = await resp.json();
  return { id: data.spreadsheetId, url: data.spreadsheetUrl };
};

// Search the user's Drive for previously-created BPMF spreadsheets.
// Returns an array of candidates (newest first), or null if the search is
// unavailable (e.g. Drive API not enabled) so callers can fall back to create.
const findSpreadsheets = async (accessToken) => {
  const q =
    `name = '${SPREADSHEET_TITLE}'` +
    " and mimeType = 'application/vnd.google-apps.spreadsheet'" +
    ' and trashed = false' +
    " and 'me' in owners";
  try {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}` +
        '&fields=files(id,name,modifiedTime,webViewLink)&orderBy=modifiedTime desc',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!resp.ok) {
      console.warn(`Drive 搜尋失敗 (${resp.status})，改為建立新試算表`);
      return null;
    }
    const data = await resp.json();
    return (data.files || []).map((f) => ({
      id: f.id,
      name: f.name,
      modifiedTime: f.modifiedTime,
      url: f.webViewLink,
    }));
  } catch (error) {
    console.warn('Drive 搜尋發生錯誤，改為建立新試算表：', error);
    return null;
  }
};

export const connect = async (options = {}) => {
  const previousEmail = readSession()?.email;
  const tokenResponse = await requestAccessToken({
    silent: false,
    hint: previousEmail,
  });
  const accessToken = tokenResponse.access_token;
  const expiresAt = Date.now() + Number(tokenResponse.expires_in) * 1000;

  const email = await fetchUserEmail(accessToken);

  const existing = readSession();
  let sheet = null;

  // 1) Reuse the sheet already linked in the current session, if still valid.
  if (existing?.spreadsheetId && existing.clientId === getGoogleClientId()) {
    sheet = await verifySpreadsheet(accessToken, existing.spreadsheetId);
  }

  // 2) No current sheet — look for a previously-used one in the user's Drive.
  if (!sheet) {
    const candidates = await findSpreadsheets(accessToken);
    if (candidates && candidates.length === 1) {
      sheet = { id: candidates[0].id, url: candidates[0].url };
    } else if (candidates && candidates.length > 1) {
      let choice = candidates[0].id; // default: newest, when no picker provided
      if (typeof options.onMultiple === 'function') {
        choice = await options.onMultiple(candidates);
      }
      if (choice === null) {
        throw new Error('已取消連結');
      }
      if (choice !== 'new') {
        const picked = candidates.find((c) => c.id === choice);
        if (picked) sheet = { id: picked.id, url: picked.url };
      }
    }
  }

  // 3) Nothing found / chose to create → make a new spreadsheet.
  if (!sheet) {
    sheet = await createSpreadsheet(accessToken);
  }

  const session = {
    clientId: getGoogleClientId(),
    accessToken,
    expiresAt,
    spreadsheetId: sheet.id,
    spreadsheetUrl: sheet.url,
    email,
  };
  writeSession(session);
  return session;
};

export const refreshSession = async () => {
  const session = readSession();
  if (!session?.spreadsheetId) throw new Error('尚未連結');
  if (session.clientId !== getGoogleClientId()) {
    throw new Error('Client ID 已變更，請重新連結');
  }
  const tokenResponse = await requestAccessToken({
    silent: true,
    hint: session.email,
  });
  const refreshed = {
    ...session,
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + Number(tokenResponse.expires_in) * 1000,
  };
  if (!session.email) {
    refreshed.email = await fetchUserEmail(refreshed.accessToken);
  }
  writeSession(refreshed);
  return refreshed;
};

export const disconnect = async () => {
  const session = readSession();
  writeSession(null);
  if (session?.accessToken && window.google?.accounts?.oauth2?.revoke) {
    try {
      await new Promise((resolve) => {
        window.google.accounts.oauth2.revoke(session.accessToken, resolve);
      });
    } catch {
      // ignore — local session already cleared
    }
  }
};

const ensureHeaderRow = async (accessToken, spreadsheetId) => {
  const getResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:J1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!getResp.ok) {
    const detail = await getResp.text();
    throw new Error(`讀取試算表失敗 (${getResp.status})：${detail}`);
  }
  const data = await getResp.json();
  const header = data.values?.[0] || [];

  // Already migrated — first column is the start-time column.
  if (header[0] === HEADER_ROW[0]) return;

  // Old layout with existing data: insert a new first column so all existing
  // cells (header + data rows) shift right and stay aligned.
  if (header.length > 0) {
    const insertResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              insertDimension: {
                range: {
                  sheetId: 0,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: 1,
                },
                inheritFromBefore: false,
              },
            },
          ],
        }),
      }
    );
    if (!insertResp.ok) {
      const detail = await insertResp.text();
      throw new Error(`插入欄位失敗 (${insertResp.status})：${detail}`);
    }
  }

  // Write (or rewrite) the full header row.
  const putResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:J1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [HEADER_ROW] }),
    }
  );
  if (!putResp.ok) {
    const detail = await putResp.text();
    throw new Error(`寫入標題列失敗 (${putResp.status})：${detail}`);
  }
};

export const appendCompletion = async (record) => {
  const session = readSession();
  if (!session?.spreadsheetId) return { skipped: true, reason: 'not_connected' };
  if (session.clientId !== getGoogleClientId()) {
    return { skipped: true, reason: 'client_id_mismatch' };
  }

  const token = await getValidAccessToken();
  if (!token) return { skipped: true, reason: 'token_unavailable' };

  await ensureHeaderRow(token, session.spreadsheetId);

  const row = recordToRow(record);

  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(session.spreadsheetId)}/values/A1:L1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values: [row] }),
    }
  );
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`同步失敗 (${resp.status})：${detail}`);
  }
  return { skipped: false };
};

// True when an OAuth sheet is linked and matches the current Client ID.
export const isConfigured = () => {
  const session = readSession();
  return Boolean(session?.spreadsheetId && session.clientId === getGoogleClientId());
};

export const getValidAccessToken = async () => {
  const session = readSession();
  if (!session) return null;
  if (session.clientId !== getGoogleClientId()) return null;
  if (Date.now() < session.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return session.accessToken;
  }
  return null;
};
