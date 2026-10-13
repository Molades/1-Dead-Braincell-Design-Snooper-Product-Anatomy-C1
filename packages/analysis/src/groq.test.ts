import { describe, expect, it, vi } from 'vitest';
import { measureElement } from '@pixelpeeper/measure';
import { evaluate } from '@pixelpeeper/rules';
import { analyze, groqSchema, type ModelOutput } from './index';

function input() {
  document.body.innerHTML = '<button id="t" style="color:#fff;background:#111;padding:12px 24px;font-size:16px">Start trial</button>';
  const facts = measureElement(document.getElementById('t')!);
  return { facts, results: evaluate(facts), scope: 'element' as const, apiKey: 'gsk_test', provider: 'groq' as const, image: { base64: 'AAAA', mediaType: 'image/png' as const } };
}
const output: ModelOutput = {
  headline: { text: 'Dark fill likely marks the main action.', evidence: ['color.background'] },
  role: { label: 'Call-to-action', detail: 'Likely the main action.', evidence: ['structure.tag'] },
  technique: { label: 'contrast', detail: 'Inverted contrast.', evidence: ['color.contrast'] },
  works: [], watch: [], tradeoff: null, steal: [], laws: [], visualOnly: [], vocabulary: [{ term: 'primary action', meaning: 'The main thing to do.' }],
};
const reply = (status: number, body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

describe('groq provider', () => {
  it('sends a strict json_schema request with the screenshot as a data URL', async () => {
    const fetch = reply(200, { model: 'qwen/qwen3.8-27b', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
    const a = await analyze({ ...input(), fetch } as never);
    const [url, init] = fetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer gsk_test');
    expect(body.model).toBe('qwen/qwen3.8-27b');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,AAAA');
    expect(a.modelInfo).toEqual({ provider: 'groq', model: 'qwen/qwen3.8-27b' });
    expect(a.headline?.label).toBe('inferred');
  });

  it('applies the same trust boundary', async () => {
    const bad = { ...output, works: [{ title: 'Big', detail: 'The 99px height is huge.', evidence: ['size.height'] }] };
    const fetch = reply(200, { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(bad) } }] });
    const a = await analyze({ ...input(), fetch } as never);
    expect(a.works).toHaveLength(0);
    expect(a.rejected[0]!.reason).toMatch(/99/);
  });

  it('maps HTTP and format failures to typed errors', async () => {
    await expect(analyze({ ...input(), fetch: reply(401, {}) } as never)).rejects.toMatchObject({ code: 'invalid-key' });
    await expect(analyze({ ...input(), fetch: reply(429, {}) } as never)).rejects.toMatchObject({ code: 'rate-limited' });
    await expect(analyze({ ...input(), fetch: reply(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] }) } as never)).rejects.toMatchObject({ code: 'truncated' });
    await expect(analyze({ ...input(), fetch: reply(200, { choices: [{ finish_reason: 'stop', message: { content: '{"nope":1}' } }] }) } as never)).rejects.toMatchObject({ code: 'unparseable' });
  });

  it('uses the compact prompt with the last known-good request settings', async () => {
    const fetch = reply(200, { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] });
    await analyze({ ...input(), fetch } as never);
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.max_completion_tokens).toBe(8000);
    expect(body.messages[0].content).not.toContain('Judgment rules library');
  });

  it('waits and retries once on a short 429, and reports the wait on a long one', async () => {
    vi.useFakeTimers();
    const ok = new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(output) } }] }), { status: 200 });
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '3' } }))
      .mockResolvedValueOnce(ok);
    const pending = analyze({ ...input(), fetch } as never);
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).resolves.toMatchObject({ scope: 'element' });
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    const slow = vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '45' } }));
    await expect(analyze({ ...input(), fetch: slow } as never)).rejects.toThrow(/about 45 seconds/);
    expect(slow).toHaveBeenCalledTimes(1);
  });

  it('produces a schema Groq strict mode accepts', () => {
    const s = groqSchema() as { $schema?: string; additionalProperties: boolean; required: string[]; properties: Record<string, unknown> };
    expect(s.$schema).toBeUndefined();
    expect(s.additionalProperties).toBe(false);
    expect(s.required.sort()).toEqual(Object.keys(s.properties).sort());
  });
});
