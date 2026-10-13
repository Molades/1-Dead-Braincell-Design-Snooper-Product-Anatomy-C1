import { ruleById } from '@pixelpeeper/rules';
import { getFact, type Analysis, type Claim, type Facts, type RuleResult } from '@pixelpeeper/schema';

/** Rendering for the lesson window: three tabs, progress, and error cards. Pure functions returning HTML. */

export const esc = (value: unknown) =>
  String(value ?? 'Unavailable').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export type Tab = 'lesson' | 'rules' | 'measurements';

// ---------------------------------------------------------------------------------------------
// Evidence: turn a fact path into a readable measured value ("Contrast 15.4:1").

const px = (v: unknown) => `${v}px`;
/** Box values (padding, radius): one number when all sides match. */
const list = (v: unknown) => (Array.isArray(v) ? (new Set(v).size === 1 ? `${v[0]}px` : v.map((n) => `${n}`).join(' ') + 'px') : String(v));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const swatch = (v: unknown) => `<i class="sw" style="background:${esc(v)}"></i>${esc(v)}`;

const LABELS: Record<string, [string, (v: unknown) => string]> = {
  'typography.fontFamily': ['Font', (v) => esc(String(v).split(',')[0]!.replace(/["']/g, ''))],
  'typography.fontSize': ['Font size', px],
  'typography.fontWeight': ['Weight', String],
  'typography.lineHeight': ['Line height', (v) => (v === null ? 'normal' : px(v))],
  'typography.letterSpacing': ['Tracking', px],
  'typography.textAlign': ['Align', String],
  'color.text': ['Text', swatch],
  'color.background': ['Background', swatch],
  'color.border': ['Border color', swatch],
  'color.opacity': ['Opacity', String],
  'spacing.padding': ['Padding', list],
  'spacing.margin': ['Margin', list],
  'spacing.gap': ['Gap', (v) => (v === null ? 'none' : px(v))],
  'spacing.scaleBase': ['Spacing grid', (v) => (v ? `${v}px grid` : 'off-grid')],
  'size.width': ['Width', px],
  'size.height': ['Height', px],
  'size.aspectRatio': ['Aspect ratio', String],
  'shape.borderWidth': ['Border', px],
  'shape.borderStyle': ['Border style', String],
  'shape.borderRadius': ['Radius', list],
  'shape.boxShadow': ['Shadow', (v) => (v === 'none' ? 'none' : 'yes')],
  'shape.backgroundImage': ['Background image', (v) => (v === 'none' ? 'none' : 'yes')],
  'layout.display': ['Display', String],
  'layout.flexDirection': ['Direction', (v) => String(v ?? '—')],
  'layout.alignItems': ['Align items', (v) => String(v ?? '—')],
  'layout.justifyContent': ['Justify', (v) => String(v ?? '—')],
  'layout.gridTemplateColumns': ['Columns', (v) => String(v ?? '—')],
  'structure.tag': ['Tag', (v) => `&lt;${esc(v)}&gt;`],
  'structure.role': ['Role attr', (v) => String(v ?? 'none')],
  'structure.depth': ['Depth', String],
  'structure.childCount': ['Children', String],
  'structure.componentType': ['Component', (v) => String(v ?? '—')],
  'a11y.minTextSize': ['Text size', (v) => (v === null ? '—' : px(v))],
  'a11y.accessibleName': ['Name', (v) => (v ? `“${esc(String(v).slice(0, 24))}”` : 'none')],
  'a11y.altText': ['Alt', (v) => (v === null ? 'missing' : v === '' ? 'empty' : 'present')],
  'consistency.sameStyleCount': ['Same style', (v) => `×${v}`],
};

export function describeEvidence(path: string, facts: Facts, results: RuleResult[]): { label: string; value: string } | null {
  if (path.startsWith('rule:')) {
    const r = results.find((x) => x.ruleId === path.slice(5));
    return r ? { label: r.name, value: STATUS[r.status] ?? r.status } : null;
  }
  if (path === 'color.contrast') {
    const c = facts.color.contrast;
    return { label: 'Contrast', value: c.canMeasure && c.ratio !== null ? `${c.ratio}:1` : "can't measure" };
  }
  if (path === 'a11y.tapTarget') {
    const t = facts.a11y.tapTarget.value;
    return { label: 'Target', value: `${Math.round(t.width)}×${Math.round(t.height)}px` };
  }
  if (path === 'size.position') {
    const p = facts.size.position.value;
    return { label: 'Position', value: `${p.x}, ${p.y}` };
  }
  const node = getFact(facts, path) as { value?: unknown } | undefined;
  if (!node || typeof node !== 'object' || !('value' in node)) return null;
  const [label, format] = LABELS[path] ?? [path.split('.').pop()!, (v: unknown) => esc(v)];
  return { label, value: format(node.value) };
}

const chips = (c: Claim, facts: Facts, results: RuleResult[]) => {
  const items = c.evidence.map((p) => describeEvidence(p, facts, results)).filter((x): x is { label: string; value: string } => !!x);
  return items.length ? `<div class="evs">${items.map((e) => `<span class="ev" title="Measured">${esc(e.label)} <b>${e.value}</b></span>`).join('')}</div>` : '';
};

// ---------------------------------------------------------------------------------------------
// Tabs

export function tabs(active: Tab, results: RuleResult[], ready: boolean): string {
  const fails = results.filter((r) => r.label === 'measured' && r.status === 'fail').length;
  const tab = (id: Tab, label: string, extra = '') =>
    `<button role="tab" data-tab="${id}" aria-selected="${active === id}" ${!ready && id !== 'lesson' ? 'disabled' : ''}>${label}${extra}</button>`;
  return `<div class="tabs" role="tablist" aria-label="Lesson sections">${tab('lesson', 'Lesson')}${tab('rules', 'Rules', fails ? ` <span class="count fail">${fails}</span>` : '')}${tab('measurements', 'Measurements')}</div>`;
}

const TECHNIQUE_LABEL: Record<string, string> = {
  contrast: 'Contrast', size: 'Size', color: 'Color', isolation: 'Isolation', position: 'Position', weight: 'Weight',
  shape: 'Shape', spacing: 'Spacing', repetition: 'Repetition', imagery: 'Imagery', restraint: 'Restraint',
};

function section(icon: string, title: string, body: string, cls = '') {
  return body ? `<section class="sec ${cls}"><h4><span class="ico" aria-hidden="true">${icon}</span>${esc(title)}</h4>${body}</section>` : '';
}

export function lessonTab(a: Analysis, facts: Facts, results: RuleResult[]): string {
  const point = (c: Claim) => `<div class="point">${c.title ? `<strong>${esc(cap(c.title))}</strong>` : ''}<p>${esc(c.text)}</p>${chips(c, facts, results)}</div>`;
  const headline = a.headline
    ? `<div class="headline"><span class="badge inferred">Inferred</span><p>${esc(a.headline.text)}</p>${chips(a.headline, facts, results)}</div>`
    : '';
  const glance = a.role || a.technique
    ? `<div class="glance">${a.role ? `<div><span class="k">Role</span><span class="v">${esc(cap(a.role.title ?? ''))}</span><p>${esc(a.role.text)}</p></div>` : ''}${a.technique ? `<div><span class="k">Attention</span><span class="v">${esc(TECHNIQUE_LABEL[a.technique.tag ?? ''] ?? a.technique.tag ?? '')}</span><p>${esc(a.technique.text)}</p></div>` : ''}</div>`
    : '';
  const laws = a.laws
    .map((c) => `<div class="point"><strong>${esc(ruleById(c.ruleId ?? '')?.name ?? c.ruleId)}</strong> <span class="stance ${esc(c.tag)}">${esc(c.tag)}</span><p>${esc(c.text)}</p>${chips(c, facts, results)}</div>`)
    .join('');
  const vocab = a.vocabulary.length
    ? `<dl class="vocab">${a.vocabulary.map((v) => `<dt>${esc(v.term)}</dt><dd>${esc(v.meaning || '—')}</dd>`).join('')}</dl>`
    : '';
  const removed = a.rejected.length
    ? `<details class="removed"><summary>${a.rejected.length} unsupported claim${a.rejected.length > 1 ? 's' : ''} removed</summary><ul>${a.rejected.map((r) => `<li><span>${esc(r.text)}</span><em>${esc(r.reason)}</em></li>`).join('')}</ul></details>`
    : '';
  return `${headline}
    <p class="legend"><span class="badge inferred">Inferred</span> interpretation · <span class="ev">chips</span> are measured evidence</p>
    ${glance}
    ${section('✓', 'What works', a.works.map(point).join(''), 'works')}
    ${section('!', 'What to watch', a.watch.map(point).join(''), 'watch')}
    ${section('⇄', 'Trade-off', a.tradeoff ? point(a.tradeoff) : '')}
    ${section('→', 'Steal this', a.steal.map((c) => `<div class="point steal"><p>${esc(c.text)}</p>${chips(c, facts, results)}</div>`).join(''), 'steal-sec')}
    ${section('◎', 'Laws & principles', laws)}
    ${section('◉', 'From the screenshot', a.visualOnly.map((c) => `<div class="point"><p>${esc(c.text)}</p></div>`).join(''))}
    ${section('Aa', 'Vocabulary', vocab)}
    <p class="meta">${esc(a.modelInfo.provider)} · ${esc(a.modelInfo.model)} · rules ${esc(a.rulesLibraryVersion)}</p>${removed}`;
}

export const STATUS: Record<string, string> = { pass: 'Pass', fail: 'Fail', observed: 'Observed', 'cannot-measure': "Can't measure" };

export function rulesTab(results: RuleResult[], scope: 'element' | 'page'): string {
  const measured = results.filter((r) => r.label === 'measured' && r.status !== 'not-applicable');
  if (!measured.length) {
    return `<p class="empty">${scope === 'page' ? 'Page-level rules (heading order, palette, type scale) are not built yet. Pick an element to run accessibility checks.' : 'No threshold rules apply to this element.'}</p>`;
  }
  const by = (s: string) => measured.filter((r) => r.status === s);
  const count = (s: string, label: string) => (by(s).length ? `<span class="status ${s}">${by(s).length} ${label}</span>` : '');
  const full = (r: RuleResult) => `<li><span class="status ${r.status}">${STATUS[r.status]}</span><div><strong>${esc(r.name)}</strong><p>${esc(r.message)}</p><p class="muted">${esc(r.criterion)}</p>${r.unevaluatedExceptions?.length && r.status === 'fail' ? `<details><summary>Exceptions not checked</summary><ul>${r.unevaluatedExceptions.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>` : ''}</div></li>`;
  const compact = (r: RuleResult) => `<li class="compact"><span class="status ${r.status}">${STATUS[r.status]}</span><div><strong>${esc(r.name)}</strong> <span class="muted">${esc(r.message)}</span></div></li>`;
  return `<p class="legend"><span class="badge">Measured</span> decided by code, same answer every time</p>
    <div class="summary">${count('fail', 'fail')}${count('cannot-measure', "can't measure")}${count('pass', 'pass')}${count('observed', 'observed')}</div>
    <ul class="rules">${[...by('fail'), ...by('cannot-measure')].map(full).join('')}${[...by('pass'), ...by('observed')].map(compact).join('')}</ul>`;
}

export function measurementsTab(f: Facts, scope: 'element' | 'page'): string {
  const rows = (paths: string[]) =>
    `<dl>${paths.map((p) => describeEvidence(p, f, [])).filter(Boolean).map((e) => `<dt>${esc(e!.label)}</dt><dd>${e!.value}</dd>`).join('')}</dl>`;
  return `<p class="legend"><span class="badge">Measured</span> read from computed styles</p>
    <h4>Typography</h4>${rows(['typography.fontFamily', 'typography.fontSize', 'typography.fontWeight', 'typography.lineHeight', 'typography.letterSpacing'])}
    <h4>Color</h4>${rows(['color.text', 'color.background', 'color.contrast', 'color.opacity'])}
    <h4>Spacing</h4>${rows(['spacing.padding', 'spacing.margin', 'spacing.gap', 'spacing.scaleBase'])}
    <h4>Size & shape</h4>${rows(['size.width', 'size.height', 'shape.borderRadius', 'shape.borderWidth', 'shape.boxShadow'])}
    <h4>Layout & structure</h4>${rows(['layout.display', 'layout.flexDirection', 'structure.tag', 'structure.componentType', ...(f.structure.role.value ? ['structure.role'] : []), 'consistency.sameStyleCount'])}
    ${scope === 'page' ? '<p class="muted">Page scope measures the root element and captures only the visible viewport. Page-wide palette and type scale are not built yet.</p>' : ''}`;
}

// ---------------------------------------------------------------------------------------------
// Progress and errors

export const STEPS = ['Reading styles', 'Capturing selection', 'Checking rules', 'Interpreting design'] as const;

export function progress(step: number, seconds: number, hasKey: boolean): string {
  const steps = hasKey ? STEPS : STEPS.slice(0, 1);
  return `<ol class="steps">${steps.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}"><span class="dot" aria-hidden="true"></span>${s}${i === step && i === 3 ? ` <span class="elapsed">${seconds}s</span>` : ''}</li>`).join('')}</ol>
    ${step >= 3 ? '<p class="muted">Rules and Measurements are ready in their tabs while the lesson is written.</p>' : ''}`;
}

export interface LessonError { code?: string; message: string; retryAt?: number }

const ERRORS: Record<string, { title: string; actions: ('retry' | 'settings' | 'pick')[] }> = {
  'no-key': { title: 'Add an API key for lessons', actions: ['settings'] },
  'invalid-key': { title: 'The API key was rejected', actions: ['settings', 'retry'] },
  'rate-limited': { title: 'Rate limit reached', actions: ['retry'] },
  network: { title: "Couldn't reach the AI provider", actions: ['retry'] },
  truncated: { title: 'The lesson came back incomplete', actions: ['retry'] },
  unparseable: { title: 'The lesson came back in the wrong shape', actions: ['retry'] },
  refused: { title: 'The model declined this selection', actions: ['pick'] },
  capture: { title: "Couldn't capture the selection", actions: ['retry', 'pick'] },
  gone: { title: 'The selection is no longer on the page', actions: ['pick'] },
};

export function errorCard(e: LessonError, now: number): string {
  const spec = ERRORS[e.code ?? ''] ?? { title: 'Something went wrong', actions: ['retry'] as const };
  const wait = e.retryAt ? Math.max(0, Math.ceil((e.retryAt - now) / 1000)) : 0;
  const button = (a: string) =>
    a === 'retry' ? `<button class="primary" data-action="retry" ${wait ? 'disabled' : ''}>${wait ? `Retry in <span class="countdown">${wait}</span>s` : 'Retry'}</button>`
    : a === 'settings' ? `<button ${spec.actions[0] === 'settings' ? 'class="primary"' : ''} data-action="settings">Open settings</button>`
    : `<button data-action="pick">Pick another</button>`;
  return `<div class="err" role="alert"><strong>${esc(spec.title)}</strong><p>${esc(e.message)}</p><div class="row">${spec.actions.map(button).join('')}</div><p class="muted">Rules and Measurements still work.</p></div>`;
}

export function noKeyCard(): string {
  return `<div class="err info"><strong>Lessons need an API key</strong><p>Add a Groq or Anthropic key in settings. Rules and Measurements work without one.</p><div class="row"><button class="primary" data-action="settings">Open settings</button></div></div>`;
}

// ---------------------------------------------------------------------------------------------
// Placement: open the window on the side away from the selection, clear of the mascot.

export function placeWindow(sel: { left: number; right: number } | null, vw: number, vh: number, width: number): { left: number; top: number; maxHeight: number } {
  const margin = 16, mascot = 104;
  const w = Math.min(width, vw - margin * 2);
  const centre = sel ? (sel.left + sel.right) / 2 : vw;
  const onLeft = centre >= vw / 2;
  const fullWidth = w >= vw - margin * 2; // narrow screens: nothing is 'away', so keep clear of the mascot
  return { left: onLeft ? margin : vw - w - margin, top: margin, maxHeight: vh - margin * 2 - (onLeft && !fullWidth ? 0 : mascot) };
}
