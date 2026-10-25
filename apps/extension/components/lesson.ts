import { ruleById } from '@pixelpeeper/rules';
import { LESSONS_MODE } from './mode';
import { getFact, type Analysis, type Claim, type Facts, type RuleResult } from '@pixelpeeper/schema';
import { icon, type IconName } from './icons';

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
/** Show colours the way designers write them: #RRGGBB, plus opacity when it is not solid. */
const hex = (v: unknown) => {
  const m = String(v).match(/rgba?\(([^)]+)\)/);
  if (!m) return String(v);
  const [r, g, b, a = 1] = m[1]!.split(',').map((n) => parseFloat(n));
  const h = '#' + [r, g, b].map((n) => Math.round(n!).toString(16).padStart(2, '0')).join('').toUpperCase();
  return a < 1 ? `${h} · ${Math.round(a * 100)}%` : h;
};
const swatch = (v: unknown) => `<i class="sw" style="background:${esc(v)}"></i>${esc(hex(v))}`;

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

/** Plain text of a rendered value, for copying ("#1B1C1F", "16px"). */
const plain = (html: string) => html.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
/** A measured value that copies itself on click. */
const copyAttr = (html: string) => `data-copy="${esc(plain(html))}"`;

/** Evidence chips: a green dot (measured), the label, the value in mono. Click copies the value. */
const chip = (e: { label: string; value: string }) =>
  `<button class="ev" ${copyAttr(e.value)} title="Measured on the page. Click to copy."><i class="mdot" aria-hidden="true"></i>${esc(e.label)} <b>${e.value}</b></button>`;
const chips = (c: Claim, facts: Facts, results: RuleResult[]) => {
  const items = c.evidence.map((p) => describeEvidence(p, facts, results)).filter((x): x is { label: string; value: string } => !!x);
  return items.length ? `<div class="evs">${items.map(chip).join('')}</div>` : '';
};

// ---------------------------------------------------------------------------------------------
// Shared pieces

/** A tag in the product's two-label language (DESIGN.md): Measured is green, Inferred is amber. */
export const measuredTag = () => `<span class="badge">${icon('shield-check', 12)}Measured</span>`;
export const inferredTag = () => `<span class="badge inferred">${icon('sparkle', 12)}Inferred</span>`;
const tile = (name: IconName, tone: 'green' | 'indigo' | 'gray' | 'red') => `<span class="ico ${tone}" aria-hidden="true">${icon(name, 16)}</span>`;
/** Lesson arrival: children rise in one after another (motion is CSS, `--i` is the order). */
const rise = (i: number) => `style="--i:${Math.min(i, 8)}"`;

// ---------------------------------------------------------------------------------------------
// Tabs: a segmented control. The white pill slides between tabs (overlay.ts measures and moves it).

export function tabs(active: Tab, results: RuleResult[], ready: boolean): string {
  const measured = results.filter((r) => r.label === 'measured' && r.status !== 'not-applicable');
  const fails = measured.filter((r) => r.status === 'fail').length;
  const passes = measured.filter((r) => r.status === 'pass').length;
  const count = fails ? ` <span class="count fail">${fails}</span>` : passes ? ` <span class="count pass">${passes}</span>` : '';
  const tab = (id: Tab, label: string, name: IconName, extra = '') =>
    `<button role="tab" data-tab="${id}" aria-selected="${active === id}" ${!ready && id !== 'lesson' ? 'disabled' : ''}>${icon(name, 14)}<span>${label}</span>${extra}</button>`;
  return `<div class="tabbar"><div class="tabs" role="tablist" aria-label="Lesson sections"><span class="pill" aria-hidden="true"></span>${tab('lesson', 'Lesson', 'sparkle')}${tab('rules', 'Rules', 'list-checks', count)}${tab('measurements', 'Measurements', 'ruler')}</div></div>`;
}

const TECHNIQUE_LABEL: Record<string, string> = {
  contrast: 'Contrast', size: 'Size', color: 'Color', isolation: 'Isolation', position: 'Position', weight: 'Weight',
  shape: 'Shape', spacing: 'Spacing', repetition: 'Repetition', imagery: 'Imagery', restraint: 'Restraint',
};

function section(i: number, name: IconName, tone: 'green' | 'indigo' | 'gray' | 'red', title: string, body: string, cls = '') {
  return body ? `<section class="sec ${cls}" ${rise(i)}><h4>${tile(name, tone)}<span>${esc(title)}</span></h4><div class="sec-body">${body}</div></section>` : '';
}

// ---------------------------------------------------------------------------------------------
// Lesson

export function lessonTab(a: Analysis, facts: Facts, results: RuleResult[]): string {
  const point = (c: Claim) => `<div class="point">${c.title ? `<strong>${esc(cap(c.title))}</strong>` : ''}<p>${esc(c.text)}</p>${chips(c, facts, results)}</div>`;
  const headline = a.headline
    ? `<div class="headline" ${rise(0)}>${inferredTag()}<p>${esc(a.headline.text)}</p>${chips(a.headline, facts, results)}<p class="legend"><i class="mdot" aria-hidden="true"></i>Measured on the page. Everything else is the AI’s reading.</p></div>`
    : '';
  const cell = (k: string, v: string, text: string) => `<div><span class="k">${k}</span><span class="v">${esc(v)}</span>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
  const glance = a.role || a.technique
    ? `<div class="glance" ${rise(1)}>${a.role ? cell('Role', cap(a.role.title ?? ''), a.role.text) : ''}${a.technique ? cell('Attention', TECHNIQUE_LABEL[a.technique.tag ?? ''] ?? a.technique.tag ?? '', a.technique.text) : ''}</div>`
    : '';
  const laws = a.laws
    .map((c) => `<div class="point"><strong>${esc(ruleById(c.ruleId ?? '')?.name ?? c.ruleId)} <span class="stance ${esc(c.tag)}">${esc(c.tag)}</span></strong><p>${esc(c.text)}</p>${chips(c, facts, results)}</div>`)
    .join('');
  const vocab = a.vocabulary.length
    ? `<dl class="vocab">${a.vocabulary.map((v) => `<dt>${esc(v.term)}</dt><dd>${esc(v.meaning || '—')}</dd>`).join('')}</dl>`
    : '';
  const removed = a.rejected.length
    ? `<details class="removed"><summary>${a.rejected.length} unsupported claim${a.rejected.length > 1 ? 's' : ''} removed</summary><ul>${a.rejected.map((r) => `<li><span>${esc(r.text)}</span><em>${esc(r.reason)}</em></li>`).join('')}</ul></details>`
    : '';
  let i = 2;
  return `<div class="lesson">${headline}${glance}
    ${section(i++, 'check-circle', 'green', 'What works', a.works.map(point).join(''), 'works')}
    ${section(i++, 'warning-diamond', 'red', 'What to watch', a.watch.map(point).join(''), 'watch')}
    ${section(i++, 'arrows-left-right', 'gray', 'Trade-off', a.tradeoff ? point(a.tradeoff) : '')}
    ${section(i++, 'lightning', 'indigo', 'Steal this', a.steal.map((c) => `<div class="point steal"><p>${esc(c.text)}</p>${chips(c, facts, results)}</div>`).join(''), 'steal-sec')}
    ${section(i++, 'scales', 'gray', 'Laws & principles', laws)}
    ${section(i++, 'image', 'gray', 'From the screenshot', a.visualOnly.map((c) => `<div class="point"><p>${esc(c.text)}</p></div>`).join(''))}
    ${section(i++, 'book-open-text', 'gray', 'Vocabulary', vocab)}
    <p class="meta" ${rise(i)}>${icon('sparkle', 12)}<span>${esc(a.modelInfo.provider)} · ${esc(a.modelInfo.model)} · rules ${esc(a.rulesLibraryVersion)}</span></p>${removed}</div>`;
}

// ---------------------------------------------------------------------------------------------
// Rules: a scoreboard, then each rule with its status, result and criterion.

export const STATUS: Record<string, string> = { pass: 'Pass', fail: 'Fail', observed: 'Observed', 'cannot-measure': "Can't measure" };
const STATUS_ICON: Record<string, IconName> = { pass: 'check-circle', fail: 'x-circle', observed: 'circle-dashed', 'cannot-measure': 'circle-dashed' };

export function rulesTab(results: RuleResult[], scope: 'element' | 'page'): string {
  const measured = results.filter((r) => r.label === 'measured' && r.status !== 'not-applicable');
  if (!measured.length) {
    return `<div class="empty-state">${tile('list-checks', 'gray')}<p>${scope === 'page' ? 'Page-level rules (heading order, palette, type scale) are not built yet. Pick an element to run accessibility checks.' : 'No threshold rules apply to this element.'}</p></div>`;
  }
  const by = (s: string) => measured.filter((r) => r.status === s);
  const order = [...by('fail'), ...by('cannot-measure'), ...by('pass'), ...by('observed')];
  const pass = by('pass').length, fail = by('fail').length;
  const keyItem = (s: string, label: string) => (by(s).length ? `<span class="k ${s}"><i></i>${by(s).length} ${label}</span>` : '');
  const row = (r: RuleResult, i: number) => `<li class="${r.status}" ${rise(i + 2)}>${icon(STATUS_ICON[r.status] ?? 'circle-dashed', 20, 'st-ico')}<div class="rule-body"><div class="rule-head"><strong>${esc(r.name)}</strong><span class="status ${r.status}">${STATUS[r.status]}</span></div><p>${esc(r.message)}</p><p class="crit">${esc(r.criterion)}</p>${r.unevaluatedExceptions?.length && r.status === 'fail' ? `<details><summary>Exceptions not checked</summary><ul>${r.unevaluatedExceptions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>` : ''}</div></li>`;
  return `<div class="rules-tab"><p class="legend" ${rise(0)}>${measuredTag()}<span>Decided by code. Same answer every time.</span></p>
    <div class="score" ${rise(1)}><div class="score-top"><p><b>${pass}</b> of ${measured.length} checks pass</p><span class="${fail ? 'fails' : ''}">${fail} fail</span></div>
      <div class="bar" role="img" aria-label="${pass} pass, ${fail} fail, ${measured.length - pass - fail} other">${order.map((r, i) => `<i class="${r.status}" style="--i:${i}"></i>`).join('')}</div>
      <div class="key">${keyItem('fail', 'fail')}${keyItem('cannot-measure', "can't measure")}${keyItem('pass', 'pass')}${keyItem('observed', 'observed')}</div></div>
    <ul class="rules">${order.map(row).join('')}</ul></div>`;
}

// ---------------------------------------------------------------------------------------------
// Measurements: grouped, with a type specimen, colour swatches, contrast and a box-model diagram.

export function measurementsTab(f: Facts, scope: 'element' | 'page'): string {
  const value = (p: string) => describeEvidence(p, f, []);
  const rows = (paths: string[]) => {
    const items = paths.map(value).filter((e): e is { label: string; value: string } => !!e);
    return `<dl class="values">${items.map((e) => `<div><dt>${esc(e.label)}</dt><dd><button class="val" ${copyAttr(e.value)} title="Click to copy">${e.value}</button></dd></div>`).join('')}</dl>`;
  };
  const group = (i: number, name: IconName, tone: 'indigo' | 'gray', title: string, body: string) =>
    `<section class="mgroup" ${rise(i)}><h4>${tile(name, tone)}<span>${title}</span></h4>${body}</section>`;

  // Typography: the text rendered in the page's own font (fonts loaded by the page reach our shadow root).
  const t = f.typography;
  const family = String(t.fontFamily.value);
  const firstFamily = family.split(',')[0]!.replace(/["']/g, '').trim();
  const sample = String(f.a11y.accessibleName.value ?? '').trim().slice(0, 40) || 'Aa Bb Cc 123';
  const lh = t.lineHeight.value === null ? 'normal' : `${t.lineHeight.value}`;
  const specimen = `<div class="specimen"><p style="font-family:${esc(family)};font-weight:${esc(t.fontWeight.value)}">${esc(sample)}</p><span>${esc(firstFamily)} · ${esc(t.fontWeight.value)} · ${esc(t.fontSize.value)} / ${esc(lh)}</span></div>`;

  // Colour: two swatches over a checkerboard (so transparency shows), then contrast with AA / AAA.
  const sw = (label: string, v: unknown) => `<div class="swatch"><i style="--c:${esc(v)}"></i><span>${label}</span><button class="val" ${copyAttr(hex(v))} title="Click to copy">${esc(hex(v))}</button></div>`;
  const c = f.color.contrast;
  const level = (name: string, ok: boolean | null) => ok === null ? '' : `<span class="lvl ${ok ? 'ok' : 'no'}">${icon(ok ? 'check-circle' : 'x-circle', 12)}${name}</span>`;
  const contrast = c.canMeasure && c.ratio !== null
    ? `<div class="contrast ${c.aa === false ? 'bad' : ''}"><div><span>Contrast</span><b>${esc(c.ratio)}:1</b></div><div class="lvls">${level('AA', c.aa)}${level('AAA', c.aaa)}</div></div>`
    : `<div class="contrast na"><div><span>Contrast</span><b>Can’t measure</b></div><p>${esc(c.reason ?? 'The background is an image or a gradient.')}</p></div>`;

  // Spacing: padding drawn around the content box.
  const pad = f.spacing.padding.value;
  const w = Number(f.size.width.value), h = Number(f.size.height.value);
  const cw = Math.max(0, Math.round(w - pad[1] - pad[3])), ch = Math.max(0, Math.round(h - pad[0] - pad[2]));
  const boxModel = scope === 'page' ? '' : `<div class="boxmodel" aria-label="Padding ${esc(list(pad))} around a ${cw} by ${ch} content box"><div class="pbox"><span class="t">${pad[0]}</span><div class="mid"><span>${pad[3]}</span><div class="content">${cw} × ${ch}</div><span>${pad[1]}</span></div><span class="b">${pad[2]}</span></div><p>Padding ${esc(list(pad))}</p></div>`;

  return `<div class="measure-tab"><p class="legend" ${rise(0)}>${measuredTag()}<span>Read from computed styles.</span></p>
    ${group(1, 'text-aa', 'indigo', 'Typography', specimen + rows(['typography.fontFamily', 'typography.fontSize', 'typography.fontWeight', 'typography.lineHeight', 'typography.letterSpacing']))}
    ${group(2, 'palette', 'indigo', 'Color', `<div class="swatches">${sw('Text', f.color.text.value)}${sw('Background', f.color.background.value)}</div>${contrast}${rows(['color.opacity'])}`)}
    ${group(3, 'arrows-out-line-horizontal', 'gray', 'Spacing', boxModel + rows(['spacing.padding', 'spacing.margin', 'spacing.gap', 'spacing.scaleBase']))}
    ${group(4, 'bounding-box', 'gray', 'Size & shape', rows(['size.width', 'size.height', 'shape.borderRadius', 'shape.borderWidth', 'shape.boxShadow']))}
    ${group(5, 'squares-four', 'gray', 'Layout & structure', rows(['layout.display', 'layout.flexDirection', 'structure.tag', 'structure.componentType', ...(f.structure.role.value ? ['structure.role'] : []), 'consistency.sameStyleCount']))}
    ${scope === 'page' ? '<p class="note">Page scope measures the root element and captures only the visible viewport. Page-wide palette and type scale are not built yet.</p>' : ''}</div>`;
}

// ---------------------------------------------------------------------------------------------
// Progress and errors

export const STEPS = ['Reading styles', 'Capturing selection', 'Checking rules', 'Interpreting design'] as const;
const STEP_ICON: IconName[] = ['code', 'camera', 'list-checks', 'sparkle'];

export function progress(step: number, seconds: number, hasKey: boolean): string {
  const steps = hasKey ? STEPS : STEPS.slice(0, 1);
  return `<div class="reading"><ol class="steps">${steps.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}"><span class="dot" aria-hidden="true">${i < step ? icon('check', 12) : icon(STEP_ICON[i]!, 14)}</span><span>${s}</span>${i === step && i === 3 ? ` <span class="elapsed">${seconds}s</span>` : ''}</li>`).join('')}</ol>
    <div class="skeleton" aria-hidden="true"><i></i><i></i><i></i><i class="short"></i></div>
    ${step >= 3 ? '<p class="note">Rules and Measurements are ready in their tabs while the lesson is written.</p>' : ''}</div>`;
}

export interface LessonError { code?: string; message: string; retryAt?: number }

const ERRORS: Record<string, { title: string; icon: IconName; actions: ('retry' | 'settings' | 'pick')[] }> = {
  'no-key': { title: 'Add an API key for lessons', icon: 'key', actions: ['settings'] },
  'invalid-key': { title: 'The API key was rejected', icon: 'key', actions: ['settings', 'retry'] },
  'rate-limited': { title: 'Rate limit reached', icon: 'hourglass-medium', actions: ['retry'] },
  network: { title: LESSONS_MODE === 'hosted' ? "Couldn't reach Pixel Peeper" : "Couldn't reach the AI provider", icon: 'wifi-slash', actions: ['retry'] },
  truncated: { title: 'The lesson came back incomplete', icon: 'warning', actions: ['retry'] },
  unparseable: { title: 'The lesson came back in the wrong shape', icon: 'warning', actions: ['retry'] },
  refused: { title: 'The model declined this selection', icon: 'warning', actions: ['pick'] },
  capture: { title: "Couldn't capture the selection", icon: 'camera', actions: ['retry', 'pick'] },
  gone: { title: 'The selection is no longer on the page', icon: 'crosshair-simple', actions: ['pick'] },
  quota: { title: 'Today’s lessons are used up', icon: 'hourglass-medium', actions: ['pick'] },
  paused: { title: 'Lessons are paused for a moment', icon: 'clock-counter-clockwise', actions: ['retry'] },
  busy: { title: 'Lessons are busy right now', icon: 'hourglass-medium', actions: ['retry'] },
  'too-many-installs': { title: 'Too many new installs from this network', icon: 'warning', actions: ['retry'] },
  server: { title: 'Something went wrong on our side', icon: 'warning', actions: ['retry'] },
};

export function errorCard(e: LessonError, now: number): string {
  const spec = ERRORS[e.code ?? ''] ?? { title: 'Something went wrong', icon: 'warning' as IconName, actions: ['retry'] as const };
  const wait = e.retryAt ? Math.max(0, Math.ceil((e.retryAt - now) / 1000)) : 0;
  const button = (a: string, i: number) =>
    a === 'retry' ? `<button class="${i === 0 ? 'primary' : ''}" data-action="retry" ${wait ? 'disabled' : ''}>${icon('arrow-counter-clockwise', 16)}${wait ? `Retry in <span class="countdown">${wait}</span>s` : 'Retry'}</button>`
    : a === 'settings' ? `<button ${i === 0 ? 'class="primary"' : ''} data-action="settings">${icon('gear-six', 16)}Open settings</button>`
    : `<button data-action="pick">${icon('crosshair-simple', 16)}Pick another</button>`;
  return `<div class="err" role="alert">${tile(spec.icon, 'red')}<div><strong>${esc(spec.title)}</strong><p>${esc(e.message)}</p><div class="row">${spec.actions.map(button).join('')}</div><p class="note">Rules and Measurements still work.</p></div></div>`;
}

/**
 * Own key: lessons need a saved key. Hosted: lessons can't be requested from this page (an
 * outdated copy of the extension). Measurements work either way.
 */
export function noKeyCard(): string {
  return LESSONS_MODE === 'hosted'
    ? `<div class="err info">${tile('wifi-slash', 'indigo')}<div><strong>Lessons aren’t available here</strong><p>Reload this page to reconnect Pixel Peeper. Rules and Measurements work without a lesson.</p></div></div>`
    : `<div class="err info">${tile('key', 'indigo')}<div><strong>Lessons need an API key</strong><p>Add a Groq or Anthropic key in settings. Rules and Measurements work without one.</p><div class="row"><button class="primary" data-action="settings">${icon('gear-six', 16)}Open settings</button></div></div></div>`;
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
