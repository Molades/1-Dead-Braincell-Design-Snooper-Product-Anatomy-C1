import type { Analysis, CaptureRecord, Claim } from '@pixelpeeper/schema';
import { describeEvidence } from './lesson';

/** Compare and export, shared by the overlay (single capture) and the Library tab (2–3 ideas). */

export type Format = 'md' | 'json' | 'css';
export const GROUPS = ['Typography', 'Color', 'Shape', 'Spacing'] as const;
export type Group = (typeof GROUPS)[number];
/** Which item (index) each group is borrowed from. */
export type Sources = Partial<Record<Group, number>>;
export const FILE_NAMES: Record<Format, string> = { md: 'DESIGN.md', json: 'tokens.json', css: 'variables.css' };
export const FORMAT_LABELS: Record<Format, string> = { md: 'DESIGN.md', json: 'tokens.json', css: 'CSS' };

export function inferredClaims(a: Analysis): Claim[] {
  return [a.headline, a.role, a.technique, ...a.works, ...a.watch, a.tradeoff, ...a.steal, ...a.laws].filter((c): c is Claim => !!c);
}

function values(items: CaptureRecord[], sources: Sources) {
  const from = (g: Group) => items[Math.min(sources[g] ?? 0, items.length - 1)]!.facts;
  return {
    font: from('Typography').typography,
    color: from('Color').color,
    radius: from('Shape').shape.borderRadius.value,
    padding: from('Spacing').spacing.padding.value,
  };
}

/** The exported file. Measured values and their sources are kept apart from inferred notes. */
export function exportText(items: CaptureRecord[], sources: Sources, format: Format): string {
  const t = values(items, sources);
  const provenance = items.map((i) => ({ title: i.title, url: i.facts.url, selector: i.facts.selector, capturedAt: i.facts.capturedAt }));
  const withLessons = items.filter((i) => i.analysis);
  if (format === 'json') {
    return JSON.stringify({
      label: 'Measured',
      sources: provenance,
      borrowedFrom: sources,
      tokens: { fontFamily: t.font.fontFamily.value, fontSize: t.font.fontSize.value, color: t.color.text.value, background: t.color.background.value, radius: t.radius, padding: t.padding },
      inferred: withLessons.map((i) => ({
        label: 'Inferred', source: i.facts.url, model: i.analysis!.modelInfo.model, headline: i.analysis!.headline?.text ?? null,
        claims: inferredClaims(i.analysis!).map((c) => ({ title: c.title ?? null, text: c.text, evidence: c.evidence })),
      })),
      notes: items.filter((i) => i.note).map((i) => ({ label: 'User authored', source: i.facts.url, note: i.note })),
    }, null, 2);
  }
  if (format === 'css') {
    return `/* Measured values. Sources: ${provenance.map((i) => i.url.replace(/\*\//g, '')).join(', ')} */\n:root {\n --font-family: ${t.font.fontFamily.value};\n --font-size: ${t.font.fontSize.value}px;\n --color-text: ${t.color.text.value};\n --color-background: ${t.color.background.value};\n --radius: ${t.radius.map((v) => v + 'px').join(' ')};\n --padding: ${t.padding.map((v) => v + 'px').join(' ')};\n}`;
  }
  const notes = items.filter((i) => i.note);
  return `# Design direction\n\n## Measured\n- Font: ${t.font.fontFamily.value}, ${t.font.fontSize.value}px\n- Color: ${t.color.text.value} on ${t.color.background.value}\n- Radius: ${t.radius.join(' ')}px\n- Padding: ${t.padding.join(' ')}px\n\n## Sources\n${provenance.map((i) => `- ${i.title} · ${i.url} · ${i.capturedAt}`).join('\n')}\n\n## Inferred\n${withLessons.length ? withLessons.map((i) => `### ${i.title}\n${inferredClaims(i.analysis!).map((c) => `- ${c.title ? `**${c.title}:** ` : ''}${c.text}`).join('\n')}`).join('\n\n') : 'No AI interpretation for these sources.'}\n${notes.length ? `\n## User authored\n${notes.map((i) => `- ${i.title}: ${i.note}`).join('\n')}\n` : ''}`;
}

const COMPARE_PATHS = [
  'typography.fontFamily', 'typography.fontSize', 'typography.fontWeight', 'typography.lineHeight',
  'color.text', 'color.background', 'color.contrast', 'spacing.padding', 'spacing.scaleBase',
  'shape.borderRadius', 'shape.borderWidth', 'shape.boxShadow', 'size.width', 'size.height',
];

/** Measured values side by side; `differs` marks rows worth looking at. Values are HTML-safe. */
export function compareRows(items: CaptureRecord[]): { label: string; values: string[]; differs: boolean }[] {
  return COMPARE_PATHS.map((path) => {
    const cells = items.map((i) => describeEvidence(path, i.facts, []));
    const values = cells.map((c) => c?.value ?? '—');
    return { label: cells.find(Boolean)?.label ?? path, values, differs: new Set(values).size > 1 };
  });
}
