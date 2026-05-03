import { getGoogleClientId } from './Settings';

const SESSION_KEY = 'bpmf_google_session';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const SPREADSHEET_TITLE = 'BPMF 練習紀錄';
const TOKEN_REFRESH_BUFFER_MS = 60_000;
const HEADER_ROW = [
  '完成時間',
  '故事',
  '得分',
  '答對',
  '字數',
  '答對率(%)',
  '提示次數',
  '答錯字',
  '用提示字',
];

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

export const isSessionValid = (session) => {
  if (!session?.accessToken || !session?.expiresAt) return false;
  if (session.clientId !== getGoogleClientId()) return false;
  return Date.now() < session.expiresAt - TOKEN_REFRESH_BUFFER_MS;
};

const waitForGsi = async () => {
  if (window.google?.accounts?.oauth2) return;
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (window.google?.accounts?.oauth2) return;
  }
  throw new Error('Google Identity Services 載入失敗，請確認網路連線');
};

const requestAccessToken = async ({ silent }) => {
  await waitForGsi();
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error('尚未設定 Client ID');

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
        } else {
          resolve(response);
        }
      },
      error_callback: (err) => {
        reject(new Error(err.message || err.type || '授權失敗'));
      },
    });
    tokenClient.requestAccessToken(silent ? { prompt: '' } : {});
  });
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

export const connect = async () => {
  const tokenResponse = await requestAccessToken({ silent: false });
  const accessToken = tokenResponse.access_token;
  const expiresAt = Date.now() + Number(tokenResponse.expires_in) * 1000;

  const existing = readSession();
  let sheet = null;
  if (existing?.spreadsheetId && existing.clientId === getGoogleClientId()) {
    sheet = await verifySpreadsheet(accessToken, existing.spreadsheetId);
  }
  if (!sheet) {
    sheet = await createSpreadsheet(accessToken);
  }

  const session = {
    clientId: getGoogleClientId(),
    accessToken,
    expiresAt,
    spreadsheetId: sheet.id,
    spreadsheetUrl: sheet.url,
  };
  writeSession(session);
  return session;
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
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:I1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!getResp.ok) {
    const detail = await getResp.text();
    throw new Error(`讀取試算表失敗 (${getResp.status})：${detail}`);
  }
  const data = await getResp.json();
  if (data.values?.[0]?.length) return;

  const putResp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/A1:I1?valueInputOption=USER_ENTERED`,
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

  const row = [
    record.completedAt,
    record.textKey,
    record.earnedScore,
    record.score,
    record.charCount,
    record.accuracy,
    record.hintCount,
    record.wrongChars.join(''),
    record.hintUsedChars.join(''),
  ];

  const resp = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(session.spreadsheetId)}/values/A1:I1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
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

export const getValidAccessToken = async () => {
  const session = readSession();
  if (!session) return null;
  if (session.clientId !== getGoogleClientId()) return null;
  if (Date.now() < session.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return session.accessToken;
  }
  try {
    const tokenResponse = await requestAccessToken({ silent: true });
    const refreshed = {
      ...session,
      accessToken: tokenResponse.access_token,
      expiresAt: Date.now() + Number(tokenResponse.expires_in) * 1000,
    };
    writeSession(refreshed);
    return refreshed.accessToken;
  } catch {
    return null;
  }
};
