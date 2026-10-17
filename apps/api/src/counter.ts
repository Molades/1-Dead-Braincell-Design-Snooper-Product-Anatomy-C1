/** Daily counters for quotas and abuse limits. Upstash Redis in production, memory locally. */
export interface Counter {
  get(key: string): Promise<number>;
  /** Increment and return the new value; the key expires after `ttlSeconds`. */
  incr(key: string, ttlSeconds: number): Promise<number>;
}

export function memoryCounter(): Counter {
  const values = new Map<string, { n: number; expires: number }>();
  const live = (key: string) => { const v = values.get(key); if (v && v.expires < Date.now()) values.delete(key); return values.get(key); };
  return {
    async get(key) { return live(key)?.n ?? 0; },
    async incr(key, ttl) { const v = live(key) ?? { n: 0, expires: Date.now() + ttl * 1000 }; v.n += 1; values.set(key, v); return v.n; },
  };
}

/** Upstash Redis over its REST API (no SDK needed). */
export function upstashCounter(url: string, token: string, doFetch: typeof fetch = fetch): Counter {
  const call = async (commands: (string | number)[][]) => {
    const res = await doFetch(`${url.replace(/\/$/, '')}/pipeline`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands) });
    if (!res.ok) throw new Error(`Rate-limit store error ${res.status}`);
    return (await res.json()) as { result: unknown }[];
  };
  return {
    async get(key) { const [r] = await call([['GET', key]]); return Number(r?.result ?? 0) || 0; },
    async incr(key, ttl) { const [r] = await call([['INCR', key], ['EXPIRE', key, ttl]]); return Number(r?.result ?? 0); },
  };
}
