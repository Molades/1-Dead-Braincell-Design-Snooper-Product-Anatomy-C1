// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AnalysisError } from '@pixelpeeper/analysis';
import { measureElement } from '@pixelpeeper/measure';
import { JSDOM } from 'jsdom';
import { memoryCounter } from './counter';
import { createHandler, envFrom } from './handler';
import { issueToken, verifyToken } from './token';

const dom = new JSDOM('<button id="t" style="color:#fff;background:#111;font-size:16px">Go</button>', { url: 'https://example.com/pricing' });
const facts = measureElement(dom.window.document.getElementById('t')!);
const analysis = { version: 2, scope: 'element', headline: null, role: null, technique: null, works: [], watch: [], tradeoff: null, steal: [], laws: [], visualOnly: [], vocabulary: [], rejected: [], modelInfo: { provider: 'groq', model: 'm' }, rulesLibraryVersion: '0.1.0', createdAt: '2026-10-14T00:00:00Z' };

function setup(over: Record<string, string> = {}, analyze = vi.fn().mockResolvedValue(analysis)) {
  const env = envFrom({ GROQ_API_KEY: 'gsk_server', TOKEN_SECRET: 'secret', DAILY_LESSON_LIMIT: '2', ...over });
  const handle = createHandler({ env, counter: memoryCounter(), now: () => Date.parse('2026-10-14T12:00:00Z'), analyze, compare: vi.fn().mockResolvedValue({ kind: 'readAcross', claims: [], bestFor: [], rejected: [], modelInfo: { provider: 'groq', model: 'm' }, createdAt: 'x' }) });
  const call = (path: string, init: RequestInit & { token?: string } = {}) =>
    handle(new Request(`https://api.example.com${path}`, { ...init, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) } }));
  const install = async () => (await (await call('/v1/install', { method: 'POST' })).json()).token as string;
  const lesson = (token: string) => call('/v1/lesson', { method: 'POST', token, body: JSON.stringify({ facts, scope: 'element', image: { base64: 'AAAA', mediaType: 'image/jpeg' }, audience: 'student' }) });
  return { call, install, lesson, analyze };
}

describe('tokens', () => {
  it('verifies its own tokens and rejects forged or altered ones', async () => {
    const { token, installId } = await issueToken('secret');
    expect(await verifyToken('secret', token)).toBe(installId);
    expect(await verifyToken('other', token)).toBeNull();
    expect(await verifyToken('secret', token.slice(0, -2) + 'xx')).toBeNull();
    expect(await verifyToken('secret', 'nonsense')).toBeNull();
  });
});

describe('hosted API', () => {
  it('issues a token with the daily allowance', async () => {
    const res = await setup().call('/v1/install', { method: 'POST' });
    const body = await res.json();
    expect(body.token).toMatch(/^v1\./);
    expect(body.quota).toMatchObject({ limit: 2, used: 0, remaining: 2, resetAt: '2026-10-15T00:00:00.000Z' });
  });

  it('rejects requests without a valid token', async () => {
    const { lesson } = setup();
    expect((await lesson('v1.bad.token')).status).toBe(401);
  });

  it('runs a lesson with the server key and the reader level, and counts it', async () => {
    const s = setup();
    const token = await s.install();
    const res = await s.lesson(token);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.analysis.version).toBe(2);
    expect(body.quota.remaining).toBe(1);
    expect(s.analyze).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'gsk_server', provider: 'groq', audience: 'student' }));
  });

  it('stops at the daily limit with a clear code', async () => {
    const s = setup();
    const token = await s.install();
    await s.lesson(token); await s.lesson(token);
    const res = await s.lesson(token);
    expect(res.status).toBe(429);
    expect((await res.json()).code).toBe('quota');
    expect(s.analyze).toHaveBeenCalledTimes(2);
  });

  it('does not count failed lessons, and hides our own key problems from users', async () => {
    const failing = vi.fn().mockRejectedValue(new AnalysisError('invalid-key', 'Groq rejected the API key.'));
    const s = setup({}, failing);
    const token = await s.install();
    const res = await s.lesson(token);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('busy');
    expect(body.error).not.toMatch(/key/i);
    expect((await (await s.call('/v1/quota', { token })).json()).quota.used).toBe(0);
  });

  it('passes provider rate limits through with a retry time', async () => {
    const s = setup({}, vi.fn().mockRejectedValue(new AnalysisError('rate-limited', 'Slow down.', 12)));
    const res = await s.lesson(await s.install());
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: 'rate-limited', retryAfter: 12 });
  });

  it('can be paused, and validates requests', async () => {
    const paused = setup({ SERVICE_PAUSED: '1' });
    expect((await (await paused.lesson(await paused.install())).json()).code).toBe('paused');
    const s = setup();
    const token = await s.install();
    const bad = await s.call('/v1/lesson', { method: 'POST', token, body: JSON.stringify({ facts: {}, scope: 'element' }) });
    expect(bad.status).toBe(400);
  });

  it('limits new installs per network', async () => {
    const s = setup({ INSTALLS_PER_IP_PER_DAY: '2' });
    await s.install(); await s.install();
    const res = await s.call('/v1/install', { method: 'POST' });
    expect(res.status).toBe(429);
  });

  it('compares through the same allowance', async () => {
    const s = setup();
    const token = await s.install();
    const item = { facts, scope: 'element', pattern: 'Button', site: 'Example', page: 'Pricing', analysis: null };
    const res = await s.call('/v1/compare', { method: 'POST', token, body: JSON.stringify({ items: [item, item], mode: 'readAcross' }) });
    expect(res.status).toBe(200);
    expect((await res.json()).quota.used).toBe(1);
  });
});
