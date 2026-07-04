import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import {
  getAppsScriptConfig,
  setAppsScriptConfig,
  hasAppsScriptConfig,
  generateSecret,
  stableStringify,
  buildJwt,
  sendRecord,
} from './appsScriptSync';

const b64urlFromBuffer = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const sample = {
  textKey: '故事',
  startedAt: '2026-07-03T00:00:00.000Z',
  completedAt: '2026-07-03T00:05:00.000Z',
  earnedScore: 10,
  score: 3,
  charCount: 12,
  accuracy: 90,
  hintCount: 1,
  wrongChars: ['錯'],
  hintUsedChars: [],
};

describe('appsScriptSync config', () => {
  it('reads empty strings when unset', () => {
    expect(getAppsScriptConfig()).toEqual({ url: '', secret: '', childName: '' });
    expect(hasAppsScriptConfig()).toBe(false);
  });

  it('round-trips config and reports configured', () => {
    setAppsScriptConfig({ url: 'https://x', secret: 's', childName: '小明' });
    expect(getAppsScriptConfig()).toEqual({ url: 'https://x', secret: 's', childName: '小明' });
    expect(hasAppsScriptConfig()).toBe(true);
  });
});

describe('generateSecret', () => {
  it('produces distinct base64url secrets', () => {
    const a = generateSecret();
    const b = generateSecret();
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(a).not.toBe(b);
  });
});

describe('stableStringify', () => {
  it('sorts object keys recursively, preserves array order', () => {
    expect(stableStringify({ b: 1, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":1}');
    expect(stableStringify(['z', 'a'])).toBe('["z","a"]');
  });
});

describe('buildJwt', () => {
  it('produces a HS256 JWT verifiable with the shared secret', async () => {
    const secret = 'topsecret';
    setAppsScriptConfig({ url: 'https://x', secret, childName: '小明' });
    const jwt = await buildJwt(sample, getAppsScriptConfig(), { now: 1000, jti: 'fixed-jti' });

    const [h, p, sig] = jwt.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));

    expect(header).toEqual({ alg: 'HS256', typ: 'JWT' });
    expect(payload.child).toBe('小明');
    expect(payload.iat).toBe(1000);
    expect(payload.exp).toBe(1300);
    expect(payload.jti).toBe('fixed-jti');

    const expectedBh = b64urlFromBuffer(
      createHash('sha256').update(stableStringify(sample), 'utf8').digest()
    );
    expect(payload.bh).toBe(expectedBh);

    const expectedSig = b64urlFromBuffer(
      createHmac('sha256', secret).update(`${h}.${p}`).digest()
    );
    expect(sig).toBe(expectedSig);
  });
});

describe('sendRecord', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips when not configured', async () => {
    const res = await sendRecord(sample);
    expect(res).toEqual({ skipped: true, reason: 'not_configured' });
  });

  it('POSTs a no-cors text/plain request with jwt+record and returns not-skipped', async () => {
    setAppsScriptConfig({ url: 'https://x', secret: 's', childName: '小明' });
    // no-cors responses are opaque; a resolved fetch is the success signal.
    const fetchMock = vi.fn().mockResolvedValue({ type: 'opaque', status: 0 });
    vi.stubGlobal('fetch', fetchMock);

    const res = await sendRecord(sample);
    expect(res).toEqual({ skipped: false });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://x');
    expect(opts.method).toBe('POST');
    expect(opts.mode).toBe('no-cors');
    expect(opts.headers['Content-Type']).toBe('text/plain');
    const body = JSON.parse(opts.body);
    expect(typeof body.jwt).toBe('string');
    expect(body.record).toEqual(sample);
  });

  it('returns network_error when the fetch throws', async () => {
    setAppsScriptConfig({ url: 'https://x', secret: 's', childName: '小明' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const res = await sendRecord(sample);
    expect(res).toEqual({ skipped: true, reason: 'network_error', detail: 'offline' });
  });
});
