import { composite, contrastRatio, parseColor, wcagPass } from '@pixelpeeper/measure';
import type { Analysis, CaptureRecord, Claim, Insight } from '@pixelpeeper/schema';
import { describeEvidence } from './lesson';

/**
 * Compare and Direction, shared by the overlay (single capture export) and the Library tab.
 * A direction borrows each category from one idea (A/B/C) or omits it. Values are Measured from
 * their source; a new text/background pairing gets its contrast recomputed, never carried over.
 */

export type Format = 'md' | 'json' | 'css';
export const CATEGORIES = ['typography', 'textColor', 'background', 'shape', 'spacing'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = { typography: 'Typography', textColor: 'Text color', background: 'Background', shape: 'Shape', spacing: 'Spacing' };
/** Index of the idea each category comes from, or 'omit'. Missing means the first idea. */
export type Choices = Partial<Record<Category, number | 'omit'>>;
export const FILE_NAMES: Record<Format, string> = { md: 'DESIGN.md', json: 'tokens.json', css: 'variables.css' };
export const FORMAT_LABELS: Record<Format, string> = { md: 'DESIGN.md', json: 'tokens.json', css: 'CSS' };
export const LETTER = ['A', 'B', 'C'];

export function inferredClaims(a: Analysis): Claim[] {
  return [a.headline, a.role, a.technique, ...a.works, ...a.watch, a.tradeoff, ...a.steal, ...a.laws].filter((c): c is Claim => !!c);
}

const pxList = (v: number[]) => (new Set(v).size === 1 ? `${v[0]}px` : v.map((n) => `${n}px`).join(' '));
const firstFamily = (stack: string) => stack.split(',')[0]!.replace(/["']/g, '').trim();

/** Short readable value of a category for one idea, used on borrow options. */
export function categoryValue(item: CaptureRecord, c: Category): string {
  const f = item.facts;
  switch (c) {
    case 'typography': return `${firstFamily(f.typography.fontFamily.value)} ${f.typography.fontSize.value}px / ${f.typography.fontWeight.value}${f.typography.lineHeight.value ? ` · ${f.typography.lineHeight.value}px` : ''}`;
    case 'textColor': return f.color.text.value;
    case 'background': return f.color.background.value;
    case 'shape': return `radius ${pxList(f.shape.borderRadius.value)}${f.shape.borderWidth.value ? ` · border ${f.shape.borderWidth.value}px` : ''}${f.shape.boxShadow.value && f.shape.boxShadow.value !== 'none' ? ' · shadow' : ''}`;
    case 'spacing': return `padding ${pxList(f.spacing.padding.value)}${f.spacing.scaleBase.value ? ` · ${f.spacing.scaleBase.value}px grid` : ''}`;
  }
}

export interface DirectionContrast {
  canMeasure: boolean;
  reason?: string;
  ratio?: number;
  aa?: boolean;
  aaa?: boolean;
  /** True when text and background come from different ideas (a new pairing). */
  newPairing: boolean;
  textFrom: string;
  backgroundFrom: string;
}

export interface Direction {
  items: CaptureRecord[];
  /** Resolved source per category (null = omitted). */
  from: Record<Category, CaptureRecord | null>;
  letters: Record<Category, string | null>;
  contrast: DirectionContrast | null;
}

export function buildDirection(items: CaptureRecord[], choices: Choices): Direction {
  const from = {} as Direction['from'];
  const letters = {} as Direction['letters'];
  for (const c of CATEGORIES) {
    const pick = choices[c] ?? 0;
    const i = pick === 'omit' ? -1 : Math.min(pick, items.length - 1);
    from[c] = i >= 0 ? items[i]! : null;
    letters[c] = i >= 0 ? LETTER[i]! : null;
  }
  return { items, from, letters, contrast: recomputeContrast(from, letters) };
}

/** Contrast of the chosen text color on the chosen background, judged at the chosen type size. */
function recomputeContrast(from: Direction['from'], letters: Direction['letters']): DirectionContrast | null {
  const text = from.textColor, bg = from.background;
  if (!text || !bg) return null;
  const base = { newPairing: text !== bg, textFrom: letters.textColor!, backgroundFrom: letters.background! };
  if (bg.facts.shape.backgroundImage.value && bg.facts.shape.backgroundImage.value !== 'none') return { ...base, canMeasure: false, reason: 'The background is an image or gradient.' };
  const fg = parseColor(text.facts.color.text.value);
  // Prefer the resolved background behind the source text; fall back to its declared color.
  const bgc = parseColor(bg.facts.color.contrast.background ?? bg.facts.color.background.value);
  if (!fg || !bgc || bgc.a === 0) return { ...base, canMeasure: false, reason: 'The background color could not be resolved.' };
  const solidBg = composite(bgc, { r: 255, g: 255, b: 255, a: 1 });
  const ratio = Math.round(contrastRatio(composite(fg, solidBg), solidBg) * 100) / 100;
  const type = from.typography ?? text;
  const pass = wcagPass(ratio, type.facts.typography.fontSize.value, type.facts.typography.fontWeight.value);
  return { ...base, canMeasure: true, ratio, aa: pass.aa, aaa: pass.aaa };
}

export function contrastLine(c: DirectionContrast | null): string {
  if (!c) return 'Contrast: not checked (text color or background omitted).';
  const pair = c.newPairing ? `text from ${c.textFrom} on background from ${c.backgroundFrom}` : `text and background from ${c.textFrom}`;
  if (!c.canMeasure) return `Contrast (${pair}): can't measure. ${c.reason}`;
  return `Contrast (${pair}): ${c.ratio}:1 · AA ${c.aa ? 'pass' : 'fail'} · AAA ${c.aaa ? 'pass' : 'fail'}`;
}

/** Plain lines describing the direction, for the rationale prompt. */
export function directionSummary(d: Direction): string {
  return [...CATEGORIES.map((c) => `${CATEGORY_LABELS[c]}: ${d.from[c] ? `from ${d.letters[c]} (${categoryValue(d.from[c]!, c)})` : 'omitted'}`), contrastLine(d.contrast)].join('\n');
}

export interface ExportExtras {
  readAcross?: Insight | null;
  rationale?: { text: string; source: 'inferred' | 'user' } | null;
}

const source = (d: Direction, c: Category) => (d.from[c] ? `${d.letters[c]} — ${d.from[c]!.title}` : null);

/** The exported file. Measured values (with sources), Inferred notes and User authored text stay apart. */
export function exportText(items: CaptureRecord[], choices: Choices, format: Format, extras: ExportExtras = {}): string {
  const d = buildDirection(items, choices);
  const t = d.from.typography?.facts.typography, tc = d.from.textColor?.facts.color.text.value, bg = d.from.background?.facts.color.background.value;
  const sh = d.from.shape?.facts.shape, sp = d.from.spacing?.facts.spacing;
  const sources = items.map((i, n) => ({ letter: LETTER[n], title: i.title, url: i.facts.url, selector: i.facts.selector, capturedAt: i.facts.capturedAt }));
  const notes = items.filter((i) => i.note);
  const readAcross = extras.readAcross?.claims ?? [];

  if (format === 'json') {
    // W3C Design Tokens format; provenance and labels under $extensions.
    const tok = (type: string, value: unknown, c: Category) => ({ $type: type, $value: value, $extensions: { pixelpeeper: { label: 'measured', source: source(d, c) } } });
    const dim = (v: number) => ({ value: v, unit: 'px' });
    const out: Record<string, unknown> = { $description: 'Design direction from Pixel Peeper. Values are measured from their sources.' };
    if (t) out.font = { family: tok('fontFamily', firstFamily(t.fontFamily.value), 'typography'), size: tok('dimension', dim(t.fontSize.value), 'typography'), weight: tok('fontWeight', t.fontWeight.value, 'typography'), ...(t.lineHeight.value ? { lineHeight: tok('dimension', dim(t.lineHeight.value), 'typography') } : {}), letterSpacing: tok('dimension', dim(t.letterSpacing.value), 'typography') };
    if (tc || bg) out.color = { ...(tc ? { text: tok('color', tc, 'textColor') } : {}), ...(bg ? { background: tok('color', bg, 'background') } : {}) };
    if (sh) out.radius = Object.fromEntries(['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map((k, i) => [k, tok('dimension', dim(sh.borderRadius.value[i] ?? 0), 'shape')]));
    if (sp) out.spacing = { padding: Object.fromEntries(['top', 'right', 'bottom', 'left'].map((k, i) => [k, tok('dimension', dim(sp.padding.value[i] ?? 0), 'spacing')])), ...(sp.gap.value ? { gap: tok('dimension', dim(sp.gap.value), 'spacing') } : {}) };
    out.$extensions = { pixelpeeper: {
      sources,
      contrast: d.contrast ? { label: 'measured', recomputed: d.contrast.newPairing, ...d.contrast } : null,
      shadow: sh && sh.boxShadow.value !== 'none' ? { label: 'measured', css: sh.boxShadow.value, source: source(d, 'shape') } : null,
      inferred: { readAcross: readAcross.map((c) => ({ title: c.title ?? null, text: c.text, evidence: c.evidence })), ...(extras.rationale?.source === 'inferred' ? { rationale: extras.rationale.text } : {}),
        lessons: items.filter((i) => i.analysis).map((i) => ({ source: i.title, headline: i.analysis!.headline?.text ?? null })) },
      userAuthored: { ...(extras.rationale?.source === 'user' ? { rationale: extras.rationale.text } : {}), notes: notes.map((i) => ({ source: i.title, note: i.note })) },
    } };
    return JSON.stringify(out, null, 2);
  }

  if (format === 'css') {
    const decl = [
      t && ` --font-family: ${t.fontFamily.value};`, t && ` --font-size: ${t.fontSize.value}px;`, t && ` --font-weight: ${t.fontWeight.value};`, t?.lineHeight.value && ` --line-height: ${t.lineHeight.value}px;`,
      tc && ` --color-text: ${tc};`, bg && ` --color-background: ${bg};`,
      sh && ` --radius: ${sh.borderRadius.value.map((v) => `${v}px`).join(' ')};`, sh && sh.boxShadow.value !== 'none' && ` --shadow: ${sh.boxShadow.value};`,
      sp && ` --padding: ${sp.padding.value.map((v) => `${v}px`).join(' ')};`, sp?.gap.value && ` --gap: ${sp.gap.value}px;`,
    ].filter(Boolean);
    const safe = (s: string) => s.replace(/\*\//g, '');
    return `/* Measured values from Pixel Peeper.\n${sources.map((s) => ` * ${s.letter}: ${safe(s.title)} — ${safe(s.url)}`).join('\n')}\n * ${safe(contrastLine(d.contrast))}\n */\n:root {\n${decl.join('\n')}\n}`;
  }

  const row = (c: Category) => `- **${CATEGORY_LABELS[c]}**: ${d.from[c] ? `${categoryValue(d.from[c]!, c)} — from ${d.letters[c]}` : '_omitted_'}`;
  const lessons = items.filter((i) => i.analysis);
  return [
    '# Design direction', '',
    '## Measured', ...CATEGORIES.map(row), `- ${contrastLine(d.contrast)}`, '',
    '## Inferred',
    ...(readAcross.length ? ['### Why these feel different', ...readAcross.map((c) => `- ${c.title ? `**${c.title}:** ` : ''}${c.text}`)] : []),
    ...(extras.rationale?.source === 'inferred' ? ['### Rationale (AI draft)', extras.rationale.text] : []),
    ...(lessons.length ? lessons.map((i) => `### ${i.title}\n${inferredClaims(i.analysis!).map((c) => `- ${c.title ? `**${c.title}:** ` : ''}${c.text}`).join('\n')}`) : ['No AI interpretation for these sources.']),
    '',
    ...(extras.rationale?.source === 'user' || notes.length ? ['## User authored', ...(extras.rationale?.source === 'user' ? ['### Rationale', extras.rationale.text] : []), ...notes.map((i) => `- ${i.title}: ${i.note}`), ''] : []),
    '## Sources', ...sources.map((s) => `- ${s.letter}: ${s.title} · ${s.url} · ${s.capturedAt}`), '',
  ].join('\n');
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

