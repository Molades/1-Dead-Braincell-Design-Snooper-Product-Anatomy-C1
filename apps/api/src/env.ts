import { memoryCounter, upstashCounter, type Counter } from './counter';

/**
 * Upstash Redis from the Vercel marketplace exposes KV_REST_API_URL/TOKEN; a direct Upstash
 * database uses UPSTASH_REDIS_REST_URL/TOKEN. Without either (local dev), counts live in memory.
 */
export function counterFromEnv(e: Record<string, string | undefined>): Counter {
  const url = e.UPSTASH_REDIS_REST_URL ?? e.KV_REST_API_URL;
  const token = e.UPSTASH_REDIS_REST_TOKEN ?? e.KV_REST_API_TOKEN;
  if (url && token) return upstashCounter(url, token);
  if (e.VERCEL_ENV === 'production') throw new Error('Rate limits need Upstash Redis in production.');
  return memoryCounter();
}
