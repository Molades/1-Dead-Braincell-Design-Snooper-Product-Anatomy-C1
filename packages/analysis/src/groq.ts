import * as z from 'zod/v4';
import type { Analysis } from '@pixelpeeper/schema';
import { RULES_VERSION } from '@pixelpeeper/rules';
import { AnalysisError } from './errors';
import { ModelOutput } from './output';
import { buildUserText, COMPACT_SYSTEM_PROMPT, type PromptInput } from './prompt';
import { validate } from './validate';

/** Groq's vision model; it supports strict json_schema output with image input. */
export const GROQ_DEFAULT_MODEL = 'qwen/qwen3.8-27b';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
/** Wait and retry once by ourselves when Groq asks for a pause no longer than this. */
const AUTO_RETRY_MAX_SECONDS = 20;
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason); }, { once: true });
});

/** The model output schema in the strict form Groq accepts. */
export function groqSchema(): Record<string, unknown> {
  const { $schema: _drop, ...schema } = z.toJSONSchema(ModelOutput) as Record<string, unknown>;
  return schema;
}

export interface GroqOptions extends PromptInput {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  /** Test seam. */
  fetch?: typeof fetch;
}

interface ChatResponse {
  model?: string;
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  error?: { message?: string };
}

/**
 * Groq chat completions (OpenAI-compatible). Structured outputs are not streamed on Groq,
 * so this is a single request; Groq usually answers within seconds.
 */
export async function analyzeWithGroq(opts: GroqOptions): Promise<Analysis> {
  const model = opts.model || GROQ_DEFAULT_MODEL;
  const doFetch = opts.fetch ?? fetch;
  // Compact prompt for Groq's per-minute token limits (the screenshot alone counts as ~2K tokens).
  // Request settings match the last version confirmed working with qwen/qwen3.8-27b.
  const request = (): Promise<Response> =>
    doFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` },
      signal: opts.signal,
      body: JSON.stringify({
        model,
        max_completion_tokens: 8000,
        temperature: 0.3,
        response_format: { type: 'json_schema', json_schema: { name: 'design_lesson', strict: true, schema: groqSchema() } },
        messages: [
          { role: 'system', content: COMPACT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: buildUserText(opts, { compact: true }) },
              { type: 'image_url', image_url: { url: `data:${opts.image.mediaType};base64,${opts.image.base64}` } },
            ],
          },
        ],
      }),
    });
  let res: Response;
  try {
    res = await request();
    const wait = retryAfter(res);
    if (res.status === 429 && wait !== null && wait <= AUTO_RETRY_MAX_SECONDS) {
      await sleep(wait * 1000, opts.signal);
      res = await request();
    }
  } catch (err) {
    if ((err as Error)?.name === 'AbortError' || (err as Error)?.name === 'TimeoutError') throw new AnalysisError('network', 'The request timed out. Try again.');
    throw new AnalysisError('network', 'Could not reach Groq. Check your connection.');
  }
  const body = (await res.json().catch(() => ({}))) as ChatResponse;
  if (res.status === 401 || res.status === 403) throw new AnalysisError('invalid-key', 'Groq rejected the API key. Check it in Pixel Peeper settings.');
  if (res.status === 429) {
    const wait = retryAfter(res);
    throw new AnalysisError('rate-limited', `Groq's per-minute token limit for your plan was reached. ${wait !== null ? `Try again in about ${Math.ceil(wait)} seconds.` : 'Wait a minute and try again.'} Retry reuses the same screenshot.`, wait ?? 60);
  }
  if (!res.ok) throw new AnalysisError('api', `Groq error ${res.status}: ${body.error?.message ?? res.statusText}`);
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'length') throw new AnalysisError('truncated', 'The response was cut off. Try again.');
  let parsed: unknown;
  try { parsed = JSON.parse(choice?.message?.content ?? ''); } catch { throw new AnalysisError('unparseable', 'The model response could not be read.'); }
  const output = ModelOutput.safeParse(parsed);
  if (!output.success) throw new AnalysisError('unparseable', 'The model response did not match the expected format.');
  return validate(output.data, { facts: opts.facts, results: opts.results, scope: opts.scope, model: body.model ?? model, rulesVersion: RULES_VERSION, provider: 'groq' });
}

/** Seconds Groq asks us to wait, from `retry-after` or the token-reset header (e.g. "7.5s", "1m2s"). */
export function retryAfter(res: Response): number | null {
  const header = res.headers.get('retry-after');
  if (header && !Number.isNaN(Number(header))) return Number(header);
  const reset = res.headers.get('x-ratelimit-reset-tokens');
  const m = reset?.match(/^(?:(\d+)m)?(?:([\d.]+)s)?$/);
  return m && (m[1] || m[2]) ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) : null;
}
