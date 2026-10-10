import { describe, expect, it, vi } from 'vitest';
import { measureElement } from '@pixelpeeper/measure';
import { evaluate } from '@pixelpeeper/rules';
import { Analysis, type Facts } from '@pixelpeeper/schema';
import { analyze, AnalysisError, buildUserContent, factPaths, numbersInText, SYSTEM_PROMPT, validate, type ModelOutput } from './index';

function setup() {
  document.body.innerHTML = '<button id="t" style="color:#fff;background:#111;padding:12px 24px;font-size:16px;line-height:24px;border-radius:8px">Start trial</button>';
  const facts: Facts = measureElement(document.getElementById('t')!);
  facts.size.width.value = 160; facts.size.height.value = 48; facts.a11y.tapTarget.value = { width: 160, height: 48 };
  const results = evaluate(facts);
  return { facts, results, ctx: { facts, results, scope: 'element' as const, model: 'test-model', rulesVersion: '0.1.0' } };
}

const base = (over: Partial<ModelOutput> = {}): ModelOutput => ({
  lesson: { text: 'Dark fill on a light page likely makes this the primary action.', evidence: ['color.background', 'color.contrast'] },
  role: { text: 'Likely the primary call-to-action.', evidence: ['structure.tag'] },
  emphasis: { text: 'Emphasis comes from inverted contrast.', evidence: ['rule:wcag-1.4.3-contrast-minimum'] },
  whyItWorks: [{ text: 'The 48px height gives a comfortable target.', evidence: ['size.height'] }],
  limitations: [],
  tradeoffs: [],
  lawReadings: [{ ruleId: 'law-fitts', text: 'A large target is quick to reach.', evidence: ['a11y.tapTarget'] }],
  visualOnly: [{ text: 'Sits beside a secondary ghost button.' }],
  vocabulary: ['contrast emphasis', 'primary action', 'contrast emphasis'],
  ...over,
});

describe('trust boundary', () => {
  it('produces a schema-valid analysis where every claim is inferred', () => {
    const { ctx } = setup();
    const a = validate(base(), ctx);
    expect(() => Analysis.parse(a)).not.toThrow();
    const claims = [a.lesson, a.role, a.emphasis, ...a.whyItWorks, ...a.lawReadings, ...a.visualOnly].filter(Boolean);
    expect(claims.length).toBe(6);
    expect(claims.every((c) => c!.label === 'inferred')).toBe(true);
    expect(a.vocabulary).toEqual(['contrast emphasis', 'primary action']);
    expect(a.rejected).toEqual([]);
  });

  it('rejects claims that state numbers not in the measurements', () => {
    const { ctx } = setup();
    const a = validate(base({ whyItWorks: [{ text: 'The 52px height is generous.', evidence: ['size.height'] }, { text: 'Contrast is 21:1.', evidence: ['color.contrast'] }] }), ctx);
    expect(a.whyItWorks).toHaveLength(0);
    expect(a.rejected.map((r) => r.reason).join()).toMatch(/52/);
  });

  it('accepts numbers that are measured or are rule thresholds', () => {
    const { ctx } = setup();
    const a = validate(base({ whyItWorks: [{ text: 'At 16px with 24px leading it clears the 4.5:1 minimum.', evidence: ['typography.fontSize'] }] }), ctx);
    expect(a.whyItWorks).toHaveLength(1);
  });

  it('drops unknown evidence paths and rejects claims left with none', () => {
    const { ctx } = setup();
    const a = validate(base({ role: { text: 'Likely primary.', evidence: ['vibes.score', 'structure.tag'] }, emphasis: { text: 'Pops.', evidence: ['made.up'] } }), ctx);
    expect(a.role!.evidence).toEqual(['structure.tag']);
    expect(a.emphasis).toBeNull();
    expect(a.rejected.some((r) => r.reason === 'Cites no measured evidence')).toBe(true);
  });

  it('only accepts law readings for queued judgment rules', () => {
    const { ctx } = setup();
    const a = validate(base({ lawReadings: [{ ruleId: 'nielsen-1', text: 'Status is visible.', evidence: ['structure.tag'] }, { ruleId: 'law-made-up', text: 'x', evidence: ['structure.tag'] }] }), ctx);
    expect(a.lawReadings).toHaveLength(0); // nielsen is page scope only; law-made-up does not exist
    expect(a.rejected).toHaveLength(2);
  });

  it('keeps visual-only claims without evidence but still bans numbers there', () => {
    const { ctx } = setup();
    const a = validate(base({ visualOnly: [{ text: 'A photo sits behind it.' }, { text: 'About 30px from the logo.' }] }), ctx);
    expect(a.visualOnly).toHaveLength(1);
    expect(a.visualOnly[0]!.visualOnly).toBe(true);
  });
});

describe('helpers', () => {
  it('lists leaf fact paths', () => {
    const { facts } = setup();
    const p = factPaths(facts);
    expect(p.has('typography.fontSize')).toBe(true);
    expect(p.has('color.contrast')).toBe(true);
    expect(p.has('typography')).toBe(false);
  });
  it('finds measurement-like numbers only', () => {
    expect(numbersInText('Nielsen #4 and 3 reasons')).toEqual([]);
    expect(numbersInText('32px target, 4.5:1 ratio, 1.4× leading')).toEqual(expect.arrayContaining([32, 4.5, 1.4]));
  });
});

describe('prompt', () => {
  it('keeps the system prompt free of per-request data so it caches', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/https?:\/\//);
    expect(SYSTEM_PROMPT).toContain('law-fitts');
  });
  it('sends image, facts, measured results and judgment queue', () => {
    const { facts, results } = setup();
    const content = buildUserContent({ facts, results, image: { base64: 'AAAA', mediaType: 'image/png' }, scope: 'element' });
    expect(content[0]!.type).toBe('image');
    const text = (content[1] as { text: string }).text;
    expect(text).toContain('wcag-1.4.3-contrast-minimum');
    expect(text).toContain('law-fitts');
    expect(text).not.toContain(facts.url);
  });
});

describe('analyze', () => {
  const opts = () => { const { facts, results } = setup(); return { facts, results, scope: 'element' as const, apiKey: 'test', image: { base64: 'AAAA', mediaType: 'image/png' as const } }; };
  const fakeClient = (response: unknown) => ({ beta: { messages: { stream: vi.fn(() => ({ finalMessage: async () => response })) } } }) as never;

  it('validates parsed output into an Analysis', async () => {
    const a = await analyze({ ...opts(), client: fakeClient({ stop_reason: 'end_turn', model: 'claude-opus-5-5', parsed_output: base() }) });
    expect(a.lesson?.label).toBe('inferred');
    expect(a.modelInfo.model).toBe('claude-opus-5-5');
  });
  it('surfaces refusals and truncation as typed errors', async () => {
    await expect(analyze({ ...opts(), client: fakeClient({ stop_reason: 'refusal', parsed_output: null }) })).rejects.toMatchObject({ code: 'refused' });
    await expect(analyze({ ...opts(), client: fakeClient({ stop_reason: 'max_tokens', parsed_output: null }) })).rejects.toBeInstanceOf(AnalysisError);
  });
});
