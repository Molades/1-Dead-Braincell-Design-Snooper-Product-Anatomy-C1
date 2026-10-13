import { describe, expect, it } from 'vitest';
import { measureElement } from '@pixelpeeper/measure';
import { evaluate } from '@pixelpeeper/rules';
import type { Analysis } from '@pixelpeeper/schema';
import { describeEvidence, errorCard, lessonTab, placeWindow, rulesTab, tabs } from './lesson';

function setup() {
  document.body.innerHTML = '<button id="t" style="color:#fff;background:#111;padding:8px 16px;font-size:16px">Go</button>';
  const facts = measureElement(document.getElementById('t')!);
  facts.size.width.value = 16; facts.size.height.value = 16; facts.a11y.tapTarget.value = { width: 16, height: 16 };
  return { facts, results: evaluate(facts) };
}
const claim = (text: string, extra = {}) => ({ id: text, text, label: 'inferred' as const, evidence: ['color.contrast', 'typography.fontSize'], ...extra });
const analysis: Analysis = {
  version: 2, scope: 'element', headline: claim('Inverted contrast marks the main action.'),
  role: claim('Main action.', { title: 'Primary CTA' }), technique: claim('Dark on light.', { tag: 'contrast' }),
  works: [claim('Reads first.', { title: 'Clear priority' })], watch: [claim('Small target.', { title: 'Tight hit area' })],
  tradeoff: claim('One focus.', { title: 'focus over variety' }), steal: [claim('Give the main action the only dark fill.')],
  laws: [claim('Small targets are slower.', { ruleId: 'law-fitts', tag: 'strains' })], visualOnly: [],
  vocabulary: [{ term: 'Isolation', meaning: 'Standing apart from neighbours.' }],
  rejected: [{ text: 'It is 99px', reason: 'States unmeasured number(s): 99' }],
  modelInfo: { provider: 'groq', model: 'qwen/qwen3.8-27b' }, rulesLibraryVersion: '0.1.0', createdAt: '2026-10-10T00:00:00Z',
};

describe('evidence', () => {
  it('shows measured values instead of fact paths', () => {
    const { facts, results } = setup();
    expect(describeEvidence('typography.fontSize', facts, results)).toEqual({ label: 'Font size', value: '16px' });
    expect(describeEvidence('color.contrast', facts, results)!.value).toMatch(/:1$/);
    expect(describeEvidence('a11y.tapTarget', facts, results)!.value).toBe('16×16px');
    expect(describeEvidence('rule:wcag-2.5.8-target-size-minimum', facts, results)).toEqual({ label: 'Target size (AA, 24px)', value: 'Fail' });
    expect(describeEvidence('made.up', facts, results)).toBeNull();
  });
});

describe('lesson tab', () => {
  it('lays out every slot with readable evidence and law names', () => {
    const { facts, results } = setup();
    const html = lessonTab(analysis, facts, results);
    for (const text of ['Inverted contrast marks', 'Primary CTA', 'Contrast', 'What works', 'Clear priority', 'What to watch', 'Trade-off', 'Steal this', 'Fitts&#39;s law', 'strains', 'Isolation', '1 unsupported claim removed'])
      expect(html).toContain(text);
    expect(html).toContain('Font size <b>16px</b>');
    expect(html).not.toContain('typography.fontSize');
  });
  it('escapes model text', () => {
    const { facts, results } = setup();
    expect(lessonTab({ ...analysis, headline: claim('<img src=x onerror=alert(1)>') }, facts, results)).not.toContain('<img src=x');
  });
});

describe('rules tab', () => {
  it('lists failures first and counts them on the tab', () => {
    const { results } = setup();
    const html = rulesTab(results, 'element');
    expect(html.indexOf('Fail')).toBeLessThan(html.indexOf('Pass'));
    expect(tabs('lesson', results, true)).toMatch(/count fail">\d/);
  });
  it('explains that page rules are not built yet', () => {
    expect(rulesTab([], 'page')).toMatch(/Page-level rules/);
  });
});

describe('errors', () => {
  it('disables retry with a countdown while rate limited', () => {
    const html = errorCard({ code: 'rate-limited', message: 'Wait.', retryAt: 10_000 }, 4_000);
    expect(html).toContain('Retry in <span class="countdown">6</span>s');
    expect(html).toContain('disabled');
    expect(errorCard({ code: 'rate-limited', message: 'Wait.', retryAt: 10_000 }, 11_000)).not.toContain('disabled');
  });
  it('sends key problems to settings', () => {
    expect(errorCard({ code: 'invalid-key', message: 'Rejected.' }, 0)).toContain('data-action="settings"');
  });
});

describe('window placement', () => {
  it('opens on the side away from the selection', () => {
    expect(placeWindow({ left: 900, right: 1100 }, 1280, 800, 400).left).toBe(16);
    expect(placeWindow({ left: 100, right: 300 }, 1280, 800, 400).left).toBe(1280 - 400 - 16);
  });
  it('fits narrow viewports and leaves room for the mascot on the right', () => {
    const p = placeWindow(null, 360, 700, 400);
    expect(p.left).toBe(16);
    expect(p.maxHeight).toBeLessThan(700 - 32);
  });
});
