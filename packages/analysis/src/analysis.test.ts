import { describe, expect, it, vi } from 'vitest';
import { measureElement } from '@pixelpeeper/measure';
import { evaluate } from '@pixelpeeper/rules';
import { Analysis, normalizeAnalysis, type Facts } from '@pixelpeeper/schema';
import { analyze, AnalysisError, buildUserContent, buildUserText, factPaths, numbersInText, SYSTEM_PROMPT, validate, type ModelOutput } from './index';

function setup() {
  document.body.innerHTML = '<button id="t" style="color:#fff;background:#111;padding:12px 24px;font-size:16px;line-height:24px;border-radius:8px">Start trial</button>';
  const facts: Facts = measureElement(document.getElementById('t')!);
  facts.size.width.value = 160; facts.size.height.value = 48; facts.a11y.tapTarget.value = { width: 160, height: 48 };
  const results = evaluate(facts);
  return { facts, results, ctx: { facts, results, scope: 'element' as const, model: 'test-model', rulesVersion: '0.1.0' } };
}

const base = (over: Partial<ModelOutput> = {}): ModelOutput => ({
  headline: { text: 'Dark fill on a light page likely makes this the primary action.', evidence: ['color.background', 'color.contrast'] },
  role: { label: 'Primary call-to-action', detail: 'Likely the main action on the page.', evidence: ['structure.tag'] },
  technique: { label: 'contrast', detail: 'Emphasis comes from inverted contrast.', evidence: ['rule:wcag-1.4.3-contrast-minimum'] },
  works: [{ title: 'Comfortable target', detail: 'The 48px height gives a comfortable target.', evidence: ['size.height'] }],
  watch: [],
  tradeoff: { leansToward: 'focus', over: 'variety', detail: 'One strong action, little else competing.', evidence: ['color.contrast'] },
  steal: [{ text: 'Give the main action the only dark fill in its region.', evidence: ['color.background'] }],
  laws: [{ ruleId: 'law-fitts', stance: 'supports', detail: 'A large target is quick to reach.', evidence: ['a11y.tapTarget'] }],
  visualOnly: [{ text: 'Sits beside a secondary ghost button.' }],
  vocabulary: [{ term: 'contrast emphasis', meaning: 'Standing out by differing in lightness.' }, { term: 'Contrast emphasis', meaning: 'dup' }, { term: 'primary action', meaning: 'The main thing to do.' }],
  ...over,
});

describe('trust boundary', () => {
  it('produces a schema-valid v2 analysis where every claim is inferred', () => {
    const { ctx } = setup();
    const a = validate(base(), ctx);
    expect(() => Analysis.parse(a)).not.toThrow();
    const claims = [a.headline, a.role, a.technique, a.tradeoff, ...a.works, ...a.steal, ...a.laws, ...a.visualOnly].filter(Boolean);
    expect(claims.length).toBe(8);
    expect(claims.every((c) => c!.label === 'inferred')).toBe(true);
    expect(a.role!.title).toBe('Primary call-to-action');
    expect(a.technique!.tag).toBe('contrast');
    expect(a.tradeoff!.title).toBe('focus over variety');
    expect(a.laws[0]!.tag).toBe('supports');
    expect(a.vocabulary.map((v) => v.term)).toEqual(['contrast emphasis', 'primary action']);
    expect(a.rejected).toEqual([]);
  });

  it('rejects claims that state numbers not in the measurements, including in titles', () => {
    const { ctx } = setup();
    const a = validate(base({ works: [
      { title: 'Generous height', detail: 'The 52px height is generous.', evidence: ['size.height'] },
      { title: 'Huge 99px target', detail: 'Easy to hit.', evidence: ['size.height'] },
      { title: 'High contrast', detail: 'Contrast is 21:1.', evidence: ['color.contrast'] },
    ] }), ctx);
    expect(a.works).toHaveLength(0);
    expect(a.rejected.map((r) => r.reason).join()).toMatch(/52/);
    expect(a.rejected.map((r) => r.reason).join()).toMatch(/99/);
  });

  it('matches decimals strictly and whole numbers with rounding', () => {
    const { ctx } = setup();
    const a = validate(base({ works: [{ title: 'Close', detail: 'Contrast is about 1.04:1.', evidence: ['color.contrast'] }] }), ctx);
    expect(a.works).toHaveLength(0);
  });

  it('accepts numbers that are measured or are rule thresholds', () => {
    const { ctx } = setup();
    const a = validate(base({ works: [{ title: 'Readable', detail: 'At 16px with 24px leading it clears the 4.5:1 minimum.', evidence: ['typography.fontSize'] }] }), ctx);
    expect(a.works).toHaveLength(1);
  });

  it('drops unknown evidence paths and rejects claims left with none', () => {
    const { ctx } = setup();
    const a = validate(base({ role: { label: 'CTA', detail: 'Likely primary.', evidence: ['vibes.score', 'structure.tag'] }, technique: { label: 'size', detail: 'Pops.', evidence: ['made.up'] } }), ctx);
    expect(a.role!.evidence).toEqual(['structure.tag']);
    expect(a.technique).toBeNull();
    expect(a.rejected.some((r) => r.reason === 'Cites no measured evidence')).toBe(true);
  });

  it('only accepts law readings for queued judgment rules, max 4', () => {
    const { ctx } = setup();
    const a = validate(base({ laws: [{ ruleId: 'nielsen-1', stance: 'supports', detail: 'Status is visible.', evidence: ['structure.tag'] }, { ruleId: 'law-made-up', stance: 'mixed', detail: 'x', evidence: ['structure.tag'] }] }), ctx);
    expect(a.laws).toHaveLength(0); // nielsen is page scope only; law-made-up does not exist
    expect(a.rejected).toHaveLength(2);
  });

  it('caps list lengths so the lesson stays scannable', () => {
    const { ctx } = setup();
    const p = { title: 'Point', detail: 'Something useful.', evidence: ['structure.tag'] };
    const a = validate(base({ works: [p, p, p, p, p], steal: [1, 2, 3].map(() => ({ text: 'Do this.', evidence: ['structure.tag'] })) }), ctx);
    expect(a.works).toHaveLength(3);
    expect(a.steal).toHaveLength(2);
  });

  it('keeps visual-only claims without evidence but still bans numbers there', () => {
    const { ctx } = setup();
    const a = validate(base({ visualOnly: [{ text: 'A photo sits behind it.' }, { text: 'About 30px from the logo.' }] }), ctx);
    expect(a.visualOnly).toHaveLength(1);
    expect(a.visualOnly[0]!.visualOnly).toBe(true);
  });

  it('opens analyses saved in the old paragraph format', () => {
    const legacy = { scope: 'element', lesson: { id: 'c1', text: 'Old lesson', label: 'inferred', evidence: ['color.contrast'] }, role: null, emphasis: null, whyItWorks: [], limitations: [], tradeoffs: [], lawReadings: [], visualOnly: [], vocabulary: ['old term'], rejected: [], modelInfo: { provider: 'anthropic', model: 'm' }, rulesLibraryVersion: '0.1.0', createdAt: '2026-01-01T00:00:00Z' };
    const a = normalizeAnalysis(legacy)!;
    expect(a.version).toBe(2);
    expect(a.headline!.text).toBe('Old lesson');
    expect(a.vocabulary).toEqual([{ term: 'old term', meaning: '' }]);
    expect(normalizeAnalysis({ nonsense: true })).toBeNull();
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

describe('audience', () => {
  it('adds the reader note to the user turn only, so the system prompt still caches', () => {
    const { facts, results } = setup();
    const student = buildUserText({ facts, results, scope: 'element', audience: 'student' });
    const senior = buildUserText({ facts, results, scope: 'element', audience: 'senior' });
    expect(student).toContain('design student');
    expect(senior).toContain('Be terse');
    expect(buildUserText({ facts, results, scope: 'element' })).not.toContain('READER:');
    expect(SYSTEM_PROMPT).not.toContain('READER:');
  });
});

describe('analyze', () => {
  const opts = () => { const { facts, results } = setup(); return { facts, results, scope: 'element' as const, apiKey: 'test', image: { base64: 'AAAA', mediaType: 'image/png' as const } }; };
  const fakeClient = (response: unknown) => ({ beta: { messages: { stream: vi.fn(() => ({ finalMessage: async () => response })) } } }) as never;

  it('validates parsed output into an Analysis', async () => {
    const a = await analyze({ ...opts(), client: fakeClient({ stop_reason: 'end_turn', model: 'claude-opus-5-5', parsed_output: base() }) });
    expect(a.headline?.label).toBe('inferred');
    expect(a.modelInfo.model).toBe('claude-opus-5-5');
  });
  it('surfaces refusals and truncation as typed errors', async () => {
    await expect(analyze({ ...opts(), client: fakeClient({ stop_reason: 'refusal', parsed_output: null }) })).rejects.toMatchObject({ code: 'refused' });
    await expect(analyze({ ...opts(), client: fakeClient({ stop_reason: 'max_tokens', parsed_output: null }) })).rejects.toBeInstanceOf(AnalysisError);
  });
});
