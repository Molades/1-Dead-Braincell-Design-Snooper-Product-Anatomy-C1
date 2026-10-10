import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { Analysis, Facts, RuleResult } from '@pixelpeeper/schema';
import { RULES_VERSION } from '@pixelpeeper/rules';
import { ModelOutput } from './output';
import { buildUserContent, SYSTEM_PROMPT, type PromptInput } from './prompt';
import { validate } from './validate';

export const DEFAULT_MODEL = 'claude-opus-5-5';

export type AnalysisErrorCode = 'invalid-key' | 'rate-limited' | 'refused' | 'truncated' | 'unparseable' | 'network' | 'api';

export class AnalysisError extends Error {
  constructor(public code: AnalysisErrorCode, message: string) { super(message); }
}

export interface AnalyzeOptions extends PromptInput {
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  /** Test seam. */
  client?: Pick<Anthropic, 'beta'>;
}

/**
 * One request: screenshot + facts + rule results in, validated inferred Analysis out.
 * Uses the user's own key, so it runs from the extension's service worker.
 */
export async function analyze(opts: AnalyzeOptions): Promise<Analysis> {
  const model = opts.model ?? DEFAULT_MODEL;
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
  let response;
  try {
    // Streamed so bytes arrive continuously: Chrome stops an extension service worker whose
    // fetch waits more than ~30s for a response, and a vision analysis can take longer.
    response = await client.beta.messages.stream(
      {
        model,
        max_tokens: 16000,
        // Server-side fallback: if a safety classifier declines, the API retries on a suitable model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(ModelOutput) },
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUserContent(opts) }],
      },
      { signal: opts.signal },
    ).finalMessage();
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new AnalysisError('invalid-key', 'The API key was rejected. Check it in Pixel Peeper settings.');
    if (err instanceof Anthropic.RateLimitError) throw new AnalysisError('rate-limited', 'Rate limited by the API. Try again in a moment.');
    if (err instanceof Anthropic.APIConnectionError) throw new AnalysisError('network', 'Could not reach the API. Check your connection.');
    if (err instanceof Anthropic.APIError) throw new AnalysisError('api', `API error ${err.status ?? ''}: ${err.message}`.trim());
    throw err;
  }
  if (response.stop_reason === 'refusal') throw new AnalysisError('refused', 'The model declined to analyze this selection.');
  if (response.stop_reason === 'max_tokens') throw new AnalysisError('truncated', 'The response was cut off. Try again.');
  const parsed = response.parsed_output;
  if (!parsed) throw new AnalysisError('unparseable', 'The model response could not be read.');
  return validate(parsed, { facts: opts.facts, results: opts.results, scope: opts.scope, model: response.model ?? model, rulesVersion: RULES_VERSION });
}

export type { Facts, RuleResult };
