import { describe, expect, it, vi } from 'vitest';
import { measureElement } from '@pixelpeeper/measure';
import { Insight } from '@pixelpeeper/schema';
import { compareIdeas, validateInsight, type CompareItem } from './index';

function item(html: string, pattern: string): CompareItem {
  document.body.innerHTML = html;
  const facts = measureElement(document.getElementById('t')!);
  return { facts, scope: 'element', pattern, site: 'Stripe', page: 'Pricing', analysis: null };
}
const a = () => item('<button id="t" style="color:#fff;background:#111;font-size:16px;line-height:24px;padding:14px 28px">Buy</button>', 'Primary CTA');
const b = () => item('<button id="t" style="color:#111;background:#fff;font-size:14px;line-height:20px;padding:8px 16px;border:1px solid #ddd">More</button>', 'Secondary button');
const ctx = { provider: 'groq', model: 'm' };

describe('compare trust boundary', () => {
  it('keeps claims whose evidence names a real letter and path, and labels them inferred', () => {
    const out = validateInsight('readAcross',
      [{ title: 'Weight of the fill', detail: 'A uses a dark fill at 16px while B stays outlined at 14px.', evidence: ['A:color.background', 'B:shape.borderWidth', 'C:typography.fontSize', 'A:made.up'] }],
      [{ item: 'A', goal: 'primary actions', detail: 'A likely reads as the main action.', evidence: ['A:color.contrast'] }],
      [a(), b()], ctx);
    expect(() => Insight.parse(out)).not.toThrow();
    expect(out.claims[0]!.evidence).toEqual(['A:color.background', 'B:shape.borderWidth']);
    expect(out.claims[0]!.label).toBe('inferred');
    expect(out.bestFor[0]!.tag).toBe('A');
  });

  it('rejects unmeasured numbers, evidence for a missing idea, and best-for a missing letter', () => {
    const out = validateInsight('readAcross',
      [{ title: 'Size', detail: 'A is 22px tall.', evidence: ['A:size.height'] }, { title: 'Only C', detail: 'C is different.', evidence: ['C:color.text'] }],
      [{ item: 'C', goal: 'x', detail: 'y', evidence: ['A:color.text'] }],
      [a(), b()], ctx);
    expect(out.claims).toHaveLength(0);
    expect(out.bestFor).toHaveLength(0);
    expect(out.rejected.map((r) => r.reason).join()).toMatch(/22/);
  });

  it('accepts recomputed direction numbers when passed in', () => {
    const pts = [{ title: 'New pairing', detail: 'Text from A on background from B gives 1.04:1.', evidence: ['A:color.text', 'B:color.background'] }];
    expect(validateInsight('rationale', pts, [], [a(), b()], ctx).claims).toHaveLength(0);
    expect(validateInsight('rationale', pts, [], [a(), b()], { ...ctx, extraNumbers: [1.04] }).claims).toHaveLength(1);
  });
});

describe('compareIdeas', () => {
  it('sends both ideas, text only, to Groq and validates the reply', async () => {
    const reply = { differences: [{ title: 'Filled versus outlined', detail: 'A fills the shape while B relies on a border.', evidence: ['A:color.background', 'B:shape.borderWidth'] }], bestFor: [] };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ model: 'qwen', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(reply) } }] }), { status: 200 }));
    const out = await compareIdeas({ provider: 'groq', apiKey: 'k', model: 'qwen', items: [a(), b()], mode: 'readAcross', audience: 'student', fetch });
    const body = JSON.parse(fetch.mock.calls[0]![1].body);
    expect(body.messages[1].content).toContain('IDEA A — Primary CTA');
    expect(body.messages[1].content).toContain('IDEA B — Secondary button');
    expect(body.messages[1].content).toContain('design student');
    expect(typeof body.messages[1].content).toBe('string');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(out.claims).toHaveLength(1);
    expect(out.modelInfo).toEqual({ provider: 'groq', model: 'qwen' });
  });

  it('drafts a rationale through Anthropic with the direction lines included', async () => {
    const parse = { rationale: [{ title: 'Calm base', detail: 'The light background from B keeps A’s type calm.', evidence: ['B:color.background', 'A:typography.fontSize'] }] };
    const stream = vi.fn(() => ({ finalMessage: async () => ({ stop_reason: 'end_turn', model: 'claude-opus-5-5', parsed_output: parse }) }));
    const out = await compareIdeas({ provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5', items: [a(), b()], mode: 'rationale', direction: 'Typography: from A', client: { beta: { messages: { stream } } } as never });
    const req = (stream.mock.calls[0] as unknown as [{ messages: { content: string }[] }])[0];
    expect(req.messages[0]!.content).toContain('DIRECTION:\nTypography: from A');
    expect(out.kind).toBe('rationale');
    expect(out.claims).toHaveLength(1);
  });

  it('refuses fewer than two ideas', async () => {
    await expect(compareIdeas({ provider: 'groq', apiKey: 'k', model: 'm', items: [a()], mode: 'readAcross' })).rejects.toThrow(/two or three/);
  });
});
