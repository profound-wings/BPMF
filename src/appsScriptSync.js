const CONFIG_KEY = 'bpmf_appsscript_config';

const readRaw = () => {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const getAppsScriptConfig = () => {
  const c = readRaw();
  return {
    url: typeof c.url === 'string' ? c.url.trim() : '',
    secret: typeof c.secret === 'string' ? c.secret.trim() : '',
    childName: typeof c.childName === 'string' ? c.childName.trim() : '',
  };
};

export const setAppsScriptConfig = (config) => {
  try {
    localStorage.setItem(
      CONFIG_KEY,
      JSON.stringify({
        url: (config.url || '').trim(),
        secret: (config.secret || '').trim(),
        childName: (config.childName || '').trim(),
      })
    );
  } catch (error) {
    console.error('Failed to save Apps Script config:', error);
  }
};

export const hasAppsScriptConfig = () => {
  const { url, secret, childName } = getAppsScriptConfig();
  return Boolean(url && secret && childName);
};

// --- base64url helpers ---

const bytesToB64url = (bytes) => {
  let str = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) str += String.fromCharCode(arr[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const utf8ToB64url = (text) => {
  const bytes = new TextEncoder().encode(text);
  return bytesToB64url(bytes);
};

export const generateSecret = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToB64url(bytes);
};

// Deterministic JSON: object keys sorted recursively, arrays kept in order.
// MUST match the Apps Script implementation byte-for-byte.
export const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return '[' + value.map(stableStringify).join(',') + ']';
  }
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value);
};

const sha256B64url = async (text) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToB64url(digest);
};

const hmacSha256B64url = async (secret, message) => {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToB64url(sig);
};

export const buildJwt = async (record, config, opts = {}) => {
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const jti = opts.jti ?? crypto.randomUUID();
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    child: config.childName,
    iat: now,
    exp: now + 300,
    jti,
    bh: await sha256B64url(stableStringify(record)),
  };
  const signingInput = `${utf8ToB64url(JSON.stringify(header))}.${utf8ToB64url(
    JSON.stringify(payload)
  )}`;
  const signature = await hmacSha256B64url(config.secret, signingInput);
  return `${signingInput}.${signature}`;
};

export const sendRecord = async (record) => {
  const config = getAppsScriptConfig();
  if (!config.url || !config.secret || !config.childName) {
    return { skipped: true, reason: 'not_configured' };
  }
  const jwt = await buildJwt(record, config);
  let resp;
  try {
    resp = await fetch(config.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ jwt, record }),
    });
  } catch (error) {
    return { skipped: true, reason: 'network_error', detail: error.message };
  }
  if (!resp.ok) {
    return { skipped: true, reason: 'http_error', detail: `HTTP ${resp.status}` };
  }
  let data;
  try {
    data = await resp.json();
  } catch {
    return { skipped: true, reason: 'bad_response' };
  }
  if (data && data.ok) return { skipped: false };
  return { skipped: true, reason: 'server_error', detail: data?.error || '未知錯誤' };
};
