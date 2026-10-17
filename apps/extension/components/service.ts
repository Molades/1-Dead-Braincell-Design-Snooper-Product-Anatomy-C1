/**
 * Client for the hosted Pixel Peeper API. The AI key lives on the server; this extension
 * holds only an anonymous install token. Used by the background worker.
 */

export const API_URL = ((import.meta.env.WXT_API_URL as string | undefined) || 'http://localhost:8787').replace(/\/$/, '');
const TOKEN_KEY = 'pixelpeeper.install';
const QUOTA_KEY = 'pixelpeeper.quota';

export interface Quota { limit: number; used: number; remaining: number; resetAt: string }

export class ServiceError extends Error {
  constructor(public code: string, message: string, public status: number, public extra: { retryAfter?: number; quota?: Quota } = {}) { super(message); }
}

async function request(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<Response> {
  try {
    return await fetch(`${API_URL}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(70_000),
    });
  } catch {
    throw new ServiceError('network', 'Couldn’t reach Pixel Peeper. Check your connection and try again.', 0);
  }
}

async function readError(res: Response): Promise<ServiceError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; retryAfter?: number; quota?: Quota };
  return new ServiceError(body.code ?? 'server', body.error ?? `Pixel Peeper answered ${res.status}.`, res.status, { retryAfter: body.retryAfter, quota: body.quota });
}

export async function lastQuota(): Promise<Quota | null> {
  return ((await chrome.storage.local.get(QUOTA_KEY))[QUOTA_KEY] as Quota | undefined) ?? null;
}
const remember = (quota?: Quota) => (quota ? chrome.storage.local.set({ [QUOTA_KEY]: quota }) : Promise.resolve());

/** The install token, registering this install on first use (or again if the server forgot it). */
async function token(renew = false): Promise<string> {
  if (!renew) {
    const stored = (await chrome.storage.local.get(TOKEN_KEY))[TOKEN_KEY] as string | undefined;
    if (stored) return stored;
  }
  const res = await request('/v1/install', { method: 'POST' });
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { token: string; quota: Quota };
  await chrome.storage.local.set({ [TOKEN_KEY]: body.token });
  await remember(body.quota);
  return body.token;
}

/** Authenticated call; one automatic re-registration if the token is rejected. */
export async function callService<T extends { quota?: Quota }>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res = await request(path, { ...init, token: await token() });
  if (res.status === 401) res = await request(path, { ...init, token: await token(true) });
  if (!res.ok) { const err = await readError(res); await remember(err.extra.quota); throw err; }
  const body = (await res.json()) as T;
  await remember(body.quota);
  return body;
}
