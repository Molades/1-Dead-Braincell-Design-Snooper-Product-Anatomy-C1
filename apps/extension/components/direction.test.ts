import { describe, expect, it } from 'vitest';
import { captureTitle, measureElement, pageInfo, patternName } from '@pixelpeeper/measure';
import type { CaptureRecord } from '@pixelpeeper/schema';
import { buildDirection, categoryValue, contrastLine, directionSummary, exportText } from './direction';

function rec(id: string, html: string, note = ''): CaptureRecord {
  document.body.innerHTML = html;
  const facts = measureElement(document.getElementById('t')!);
  const page = { ...pageInfo(document), siteName: 'Site', pageName: id };
  const pattern = patternName(facts, 'element');
  const at = '2026-10-13T10:00:00.000Z';
  return { id, createdAt: at, updatedAt: at, scope: 'element', page, facts, analysis: null, pattern, title: captureTitle(pattern, page), titleSource: 'auto', saved: true, savedAt: at, note, hasImage: false };
}
const dark = rec('dark', '<button id="t" style="color:#ffffff;background:#111111;font-size:16px;font-weight:600;padding:14px 28px;border-radius:999px">Buy</button>', 'Use for CTAs');
const light = rec('light', '<button id="t" style="color:#111111;background:#ffffff;font-size:14px;padding:8px 16px;border:1px solid #dddddd">More</button>');

describe('direction', () => {
  it('borrows each category from the chosen idea, or omits it', () => {
    const d = buildDirection([dark, light], { typography: 1, spacing: 'omit' });
    expect(d.letters.typography).toBe('B');
    expect(d.letters.textColor).toBe('A');
    expect(d.from.spacing).toBeNull();
    expect(categoryValue(dark, 'spacing')).toBe('padding 14px 28px 14px 28px');
  });

  it('recomputes contrast for a new text/background pairing instead of carrying a pass over', () => {
    const same = buildDirection([dark, light], {});
    expect(same.contrast!.newPairing).toBe(false);
    expect(same.contrast!.aa).toBe(true);
    // White text from A on white background from B: a new pairing that fails.
    const mixed = buildDirection([dark, light], { textColor: 0, background: 1 });
    expect(mixed.contrast!.newPairing).toBe(true);
    expect(mixed.contrast!.ratio).toBe(1);
    expect(mixed.contrast!.aa).toBe(false);
    expect(contrastLine(mixed.contrast)).toContain('text from A on background from B');
  });

  it('skips the contrast check when a color is omitted', () => {
    expect(buildDirection([dark, light], { background: 'omit' }).contrast).toBeNull();
  });

  it('summarises the direction for the rationale prompt', () => {
    const s = directionSummary(buildDirection([dark, light], { background: 1 }));
    expect(s).toContain('Background: from B');
    expect(s).toMatch(/Contrast \(text from A on background from B\): 1:1/);
  });

  it('exports W3C tokens with provenance, and keeps measured, inferred and user text apart', () => {
    const extras = { readAcross: { kind: 'readAcross' as const, claims: [{ id: 'k', title: 'Weight', text: 'A is heavier.', label: 'inferred' as const, evidence: ['A:color.background'] }], bestFor: [], rejected: [], modelInfo: { provider: 'groq', model: 'm' }, createdAt: 'x' }, rationale: { text: 'My reasoning.', source: 'user' as const } };
    const json = JSON.parse(exportText([dark, light], { typography: 1, shape: 'omit' }, 'json', extras));
    expect(json.font.size).toEqual({ $type: 'dimension', $value: { value: 14, unit: 'px' }, $extensions: { pixelpeeper: { label: 'measured', source: expect.stringMatching(/^B — /) } } });
    expect(json.color.text.$type).toBe('color');
    expect(json.radius).toBeUndefined();
    expect(json.$extensions.pixelpeeper.inferred.readAcross[0].text).toBe('A is heavier.');
    expect(json.$extensions.pixelpeeper.userAuthored.rationale).toBe('My reasoning.');
    expect(json.$extensions.pixelpeeper.userAuthored.notes[0].note).toBe('Use for CTAs');

    const md = exportText([dark, light], { background: 1 }, 'md', extras);
    expect(md.indexOf('## Measured')).toBeLessThan(md.indexOf('## Inferred'));
    expect(md).toContain('## User authored');
    expect(md).toContain('text from A on background from B');

    const css = exportText([dark, light], { shape: 'omit' }, 'css');
    expect(css).toContain('--font-size: 16px;');
    expect(css).not.toContain('--radius');
    expect(css).not.toContain('Inferred');
  });
});
