import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';
import { AnalysisError } from './errors';
import { retryAfter } from './groq';

/**
 * Text-only structured call for either provider. Used by Compare (the per-capture lesson keeps
 * its own, image-aware path in client.ts / groq.ts). Returns the parsed object and the model used.
 */
export interface StructuredOptions<T extends z.ZodType> {
  provider: 'anthropic' | 'groq';
  apiKey: string;
  model: string;
  system: string;
  user: string;
  schema: T;
  name: string;
  maxTokens?: number;
  signal?: AbortSignal;
  /** Test seams. */
  client?: Pick<Anthropic, 'beta'>;
  fetch?: typeof fetch;
}

export async function structuredCall<T extends z.ZodType>(o: StructuredOptions<T>): Promise<{ data: z.infer<T>; model: string }> {
  return o.provider === 'groq' ? groqCall(o) : anthropicCall(o);
}

async function anthropicCall<T extends z.ZodType>(o: StructuredOptions<T>) {
  const client = o.client ?? new Anthropic({ apiKey: o.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  let response;
  try {
    response = await client.beta.messages.stream({
      model: o.model,
      max_tokens: o.maxTokens ?? 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(o.schema) },
      system: [{ type: 'text', text: o.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: o.user }],
    }, { signal: o.signal }).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new AnalysisError('invalid-key', 'The API key was rejected. Check it in Pixel Peeper settings.');
    if (err instanceof Anthropic.RateLimitError) throw new AnalysisError('rate-limited', 'Rate limited by the API. Try again in a moment.', 60);
    if (err instanceof Anthropic.APIConnectionError) throw new AnalysisError('network', 'Could not reach the API. Check your connection.');
    if (err instanceof Anthropic.APIError) throw new AnalysisError('api', `API error ${err.status ?? ''}: ${err.message}`.trim());
    throw err;
  }
  if (response.stop_reason === 'refusal') throw new AnalysisError('refused', 'The model declined this request.');
  if (response.stop_reason === 'max_tokens') throw new AnalysisError('truncated', 'The response was cut off. Try again.');
  if (!response.parsed_output) throw new AnalysisError('unparseable', 'The model response could not be read.');
  return { data: response.parsed_output as z.infer<T>, model: response.model ?? o.model };
}

async function groqCall<T extends z.ZodType>(o: StructuredOptions<T>) {
  const { $schema: _drop, ...schema } = z.toJSONSchema(o.schema) as Record<string, unknown>;
  const doFetch = o.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
      signal: o.signal,
      body: JSON.stringify({
        model: o.model,
        max_completion_tokens: o.maxTokens ?? 8000,
        temperature: 0.3,
        response_format: { type: 'json_schema', json_schema: { name: o.name, strict: true, schema } },
        messages: [{ role: 'system', content: o.system }, { role: 'user', content: o.user }],
      }),
    });
  } catch {
    throw new AnalysisError('network', 'Could not reach Groq. Check your connection.');
  }
  const body = (await res.json().catch(() => ({}))) as { model?: string; choices?: { finish_reason?: string; message?: { content?: string | null } }[]; error?: { message?: string } };
  if (res.status === 401 || res.status === 403) throw new AnalysisError('invalid-key', 'Groq rejected the API key. Check it in Pixel Peeper settings.');
  if (res.status === 429) { const wait = retryAfter(res); throw new AnalysisError('rate-limited', `Groq's per-minute token limit was reached. ${wait !== null ? `Try again in about ${Math.ceil(wait)} seconds.` : 'Wait a minute and try again.'}`, wait ?? 60); }
  if (!res.ok) throw new AnalysisError('api', `Groq error ${res.status}: ${body.error?.message ?? res.statusText}`);
  const choice = body.choices?.[0];
  if (choice?.finish_reason === 'length') throw new AnalysisError('truncated', 'The response was cut off. Try again.');
  let parsed: unknown;
  try { parsed = JSON.parse(choice?.message?.content ?? ''); } catch { throw new AnalysisError('unparseable', 'The model response could not be read.'); }
  const out = o.schema.safeParse(parsed);
  if (!out.success) throw new AnalysisError('unparseable', 'The model response did not match the expected format.');
  return { data: out.data as z.infer<T>, model: body.model ?? o.model };
}
