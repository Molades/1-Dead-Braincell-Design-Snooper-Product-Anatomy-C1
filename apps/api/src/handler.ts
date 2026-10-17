import { analyze, AnalysisError, compareIdeas, GROQ_DEFAULT_MODEL, type AnalyzeOptions, type CompareOptions } from '@pixelpeeper/analysis';
import { evaluate } from '@pixelpeeper/rules';
import { Analysis, Facts, Level } from '@pixelpeeper/schema';
import { z } from 'zod';
import type { Counter } from './counter';
import { issueToken, verifyToken } from './token';

/**
 * Pixel Peeper hosted API. The AI key lives only here; the extension authenticates with an
 * anonymous install token and gets a daily allowance of lessons.
 *
 *   POST /v1/install   → { token, quota }
 *   GET  /v1/quota     → { quota }
 *   POST /v1/lesson    → { analysis, quota }     (counts 1)
 *   POST /v1/compare   → { insight, quota }      (counts 1)
 */

export interface Env {
  groqApiKey: string;
  tokenSecret: string;
  model: string;
  dailyLimit: number;
  /** Across all installs; protects the bill if something goes wrong. */
  globalDailyLimit: number;
  installsPerIpPerDay: number;
  paused: boolean;
}

export function envFrom(e: Record<string, string | undefined>): Env {
  const need = (k: string) => { const v = e[k]; if (!v) throw new Error(`Missing environment variable ${k}`); return v; };
  return {
    groqApiKey: need('GROQ_API_KEY'),
    tokenSecret: need('TOKEN_SECRET'),
    model: e.GROQ_MODEL || GROQ_DEFAULT_MODEL,
    dailyLimit: Number(e.DAILY_LESSON_LIMIT ?? 10),
    globalDailyLimit: Number(e.GLOBAL_DAILY_LIMIT ?? 2000),
    installsPerIpPerDay: Number(e.INSTALLS_PER_IP_PER_DAY ?? 5),
    paused: e.SERVICE_PAUSED === '1' || e.SERVICE_PAUSED === 'true',
  };
}

export interface Deps {
  env: Env;
  counter: Counter;
  now?: () => number;
  /** Seams for tests; default to the real provider calls. */
  analyze?: (o: AnalyzeOptions) => Promise<Analysis>;
  compare?: (o: CompareOptions) => ReturnType<typeof compareIdeas>;
}

const MAX_IMAGE_CHARS = 4_000_000; // base64; Vercel caps request bodies at ~4.5 MB
const DAY = 86_400;

const LessonBody = z.object({
  facts: Facts,
  scope: z.enum(['element', 'page']),
  image: z.object({ base64: z.string().min(1).max(MAX_IMAGE_CHARS), mediaType: z.enum(['image/jpeg', 'image/png']) }),
  audience: Level.optional(),
});
const CompareBody = z.object({
  items: z.array(z.object({
    facts: Facts, scope: z.enum(['element', 'page']), pattern: z.string().max(200), site: z.string().max(200), page: z.string().max(200),
    analysis: Analysis.nullable(),
  })).min(2).max(3),
  mode: z.enum(['readAcross', 'rationale']),
  direction: z.string().max(4000).optional(),
  extraNumbers: z.array(z.number()).max(20).optional(),
  audience: Level.optional(),
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
const fail = (status: number, code: string, error: string, extra: Record<string, unknown> = {}) => json({ error, code, ...extra }, status);

export function createHandler(deps: Deps): (req: Request) => Promise<Response> {
  const { env, counter } = deps;
  const now = deps.now ?? Date.now;
  const runAnalyze = deps.analyze ?? analyze;
  const runCompare = deps.compare ?? compareIdeas;

  const today = () => new Date(now()).toISOString().slice(0, 10);
  const resetAt = () => { const d = new Date(now()); d.setUTCHours(24, 0, 0, 0); return d.toISOString(); };
  const quota = async (installId: string) => {
    const used = await counter.get(`q:${installId}:${today()}`);
    return { limit: env.dailyLimit, used, remaining: Math.max(0, env.dailyLimit - used), resetAt: resetAt() };
  };
  const ip = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';

  /** Check the allowance before spending, count it only after a successful answer. */
  async function metered<T>(installId: string, work: () => Promise<T>): Promise<Response | { result: T; quota: Awaited<ReturnType<typeof quota>> }> {
    if (env.paused) return fail(503, 'paused', 'Lessons are paused for a moment. Measurements and rule checks still work.');
    const q = await quota(installId);
    if (q.remaining <= 0) return fail(429, 'quota', `You’ve used today’s ${env.dailyLimit} lessons. They reset at midnight UTC.`, { quota: q });
    if ((await counter.get(`g:${today()}`)) >= env.globalDailyLimit) return fail(503, 'busy', 'Pixel Peeper is very busy today. Try again later.');
    try {
      const result = await work();
      await counter.incr(`q:${installId}:${today()}`, 2 * DAY);
      await counter.incr(`g:${today()}`, 2 * DAY);
      return { result, quota: await quota(installId) };
    } catch (err) {
      if (err instanceof AnalysisError) {
        // Provider problems are ours to hide: a key or quota issue on our side is not the user's fault.
        if (err.code === 'invalid-key') return fail(503, 'busy', 'Lessons are unavailable right now. Try again later.');
        return fail(err.code === 'rate-limited' ? 429 : 502, err.code, err.message, err.retryAfter ? { retryAfter: err.retryAfter } : {});
      }
      throw err;
    }
  }

  return async (req) => {
    const path = new URL(req.url).pathname.replace(/^\/api/, '').replace(/\/$/, '');
    try {
      if (req.method === 'POST' && path === '/v1/install') {
        const n = await counter.incr(`i:${ip(req)}:${today()}`, DAY);
        if (n > env.installsPerIpPerDay) return fail(429, 'too-many-installs', 'Too many new installs from this network today.');
        const { token, installId } = await issueToken(env.tokenSecret);
        return json({ token, quota: await quota(installId) });
      }

      const installId = await verifyToken(env.tokenSecret, req.headers.get('authorization')?.replace(/^Bearer\s+/i, ''));
      if (!installId) return fail(401, 'unauthorized', 'Unknown install. The extension will register again.');

      if (req.method === 'GET' && path === '/v1/quota') return json({ quota: await quota(installId) });

      if (req.method === 'POST' && path === '/v1/lesson') {
        const body = LessonBody.safeParse(await req.json().catch(() => null));
        if (!body.success) return fail(400, 'bad-request', 'The lesson request was not valid.');
        const { facts, scope, image, audience } = body.data;
        const out = await metered(installId, () => runAnalyze({
          provider: 'groq', model: env.model, apiKey: env.groqApiKey, facts, scope, audience,
          results: evaluate(facts, { scope }), image: image as AnalyzeOptions['image'], signal: AbortSignal.timeout(55_000),
        }));
        return out instanceof Response ? out : json({ analysis: out.result, quota: out.quota });
      }

      if (req.method === 'POST' && path === '/v1/compare') {
        const body = CompareBody.safeParse(await req.json().catch(() => null));
        if (!body.success) return fail(400, 'bad-request', 'The compare request was not valid.');
        const out = await metered(installId, () => runCompare({ provider: 'groq', model: env.model, apiKey: env.groqApiKey, ...body.data, signal: AbortSignal.timeout(55_000) }));
        return out instanceof Response ? out : json({ insight: out.result, quota: out.quota });
      }

      return fail(404, 'not-found', 'Not found.');
    } catch (err) {
      console.error('Pixel Peeper API error', err);
      return fail(500, 'server', 'Something went wrong on our side. Try again.');
    }
  };
}
