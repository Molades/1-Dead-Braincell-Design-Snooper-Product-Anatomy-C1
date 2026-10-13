import { ruleById } from '@pixelpeeper/rules';
import type { Analysis, Annotations, Claim } from '@pixelpeeper/schema';
import { esc } from './lesson';

/**
 * Full-screen capture viewer: the screenshot with measured annotations drawn over it.
 * Annotations come only from captured geometry (Measured), never from the model.
 * Coordinates are CSS px of the captured frame; the SVG viewBox matches the frame.
 */

export const LAYERS = ['spacing', 'type', 'color', 'targets', 'issues'] as const;
export type Layer = (typeof LAYERS)[number];
export const LAYER_LABELS: Record<Layer, string> = { spacing: 'Spacing', type: 'Type', color: 'Color', targets: 'Targets', issues: 'Issues' };
export const DEFAULT_LAYERS: Layer[] = ['spacing', 'issues'];

/** Which annotation layers a claim's evidence refers to. */
export function layersForEvidence(paths: string[]): Layer[] {
  const out = new Set<Layer>();
  for (const p of paths) {
    if (p.startsWith('typography.') || p === 'a11y.minTextSize') out.add('type');
    else if (p === 'color.contrast' || /^rule:wcag-1\.4\./.test(p)) { out.add('color'); out.add('issues'); }
    else if (p.startsWith('color.')) out.add('color');
    else if (p.startsWith('spacing.') || p === 'shape.borderRadius') out.add('spacing');
    else if (p === 'a11y.tapTarget' || p.startsWith('size.') || /^rule:wcag-2\.5\./.test(p)) { out.add('targets'); if (p.startsWith('rule:')) out.add('issues'); }
    else if (p.startsWith('rule:guideline-')) { out.add('type'); out.add('issues'); }
  }
  return [...out];
}

const n = (v: number) => Math.round(v * 10) / 10;
/** Label with a white halo; size stays constant on screen via --u (frame units per screen px). */
const label = (x: number, y: number, text: string, cls = '', anchor = 'start') =>
  `<text class="lbl ${cls}" x="${n(x)}" y="${n(y)}" text-anchor="${anchor}">${esc(text)}</text>`;

export function annotationSVG(a: Annotations, on: Layer[]): string {
  const g = (layer: Layer, body: string) => `<g class="layer ${layer}${on.includes(layer) ? '' : ' off'}" data-layer="${layer}">${body}</g>`;
  let spacing = '';
  if (a.box) {
    const { rect: r, padding: [t, rt, b, l] } = a.box;
    const band = (x: number, y: number, w: number, h: number) => (w > 0 && h > 0 ? `<rect class="pad" x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}"/>` : '');
    spacing += band(r.x, r.y, r.width, t) + band(r.x, r.y + r.height - b, r.width, b) + band(r.x, r.y + t, l, r.height - t - b) + band(r.x + r.width - rt, r.y + t, rt, r.height - t - b);
    if (t) spacing += label(r.x + r.width / 2, r.y + t / 2, `${t}`, 'pad-l', 'middle');
    if (l) spacing += label(r.x + l / 2, r.y + r.height / 2, `${l}`, 'pad-l', 'middle');
    spacing += `<rect class="border" x="${n(r.x)}" y="${n(r.y)}" width="${n(r.width)}" height="${n(r.height)}"/>`;
  }
  spacing += a.children.map((c) => `<rect class="child" x="${c.rect.x}" y="${c.rect.y}" width="${c.rect.width}" height="${c.rect.height}"><title>${esc(c.label)} · ${Math.round(c.rect.width)}×${Math.round(c.rect.height)}</title></rect>`).join('');
  spacing += a.gaps.map((gp) => {
    const tick = gp.axis === 'y'
      ? `<line class="gap" x1="${gp.x1 - 4}" y1="${gp.y1}" x2="${gp.x1 + 4}" y2="${gp.y1}"/><line class="gap" x1="${gp.x2 - 4}" y1="${gp.y2}" x2="${gp.x2 + 4}" y2="${gp.y2}"/>`
      : `<line class="gap" x1="${gp.x1}" y1="${gp.y1 - 4}" x2="${gp.x1}" y2="${gp.y1 + 4}"/><line class="gap" x1="${gp.x2}" y1="${gp.y2 - 4}" x2="${gp.x2}" y2="${gp.y2 + 4}"/>`;
    const mx = (gp.x1 + gp.x2) / 2, my = (gp.y1 + gp.y2) / 2;
    return `<line class="gap" x1="${gp.x1}" y1="${gp.y1}" x2="${gp.x2}" y2="${gp.y2}"><title>Gap ${gp.value}px</title></line>${tick}${label(mx + (gp.axis === 'y' ? 6 : 0), my + (gp.axis === 'x' ? -6 : 4), `${gp.value}`, 'gap-l', gp.axis === 'y' ? 'start' : 'middle')}`;
  }).join('');

  const type = a.text.map((t) => `<rect class="text-box" x="${t.rect.x}" y="${t.rect.y}" width="${t.rect.width}" height="${t.rect.height}"><title>“${esc(t.sample)}” · ${t.size}px${t.lineHeight ? `/${t.lineHeight}px` : ''} · ${t.weight}</title></rect>${label(t.rect.x, t.rect.y - 4, `${t.size}${t.lineHeight ? `/${t.lineHeight}` : ''} · ${t.weight}`, 'type-l')}`).join('');

  const color = a.swatches.map((s) => `<circle class="sw" cx="${s.x + 6}" cy="${s.y + 6}" r="6" style="fill:${esc(s.color)}"><title>${esc(s.color)}</title></circle>${label(s.x + 16, s.y + 10, s.color.replace(/^rgb\((.*)\)$/, '$1'), 'color-l')}`).join('')
    + a.text.filter((t) => t.contrast !== null).map((t) => label(t.rect.x + t.rect.width, t.rect.y + t.rect.height + 12, `${t.contrast}:1`, `contrast-l ${t.aa ? 'ok' : 'bad'}`, 'end')).join('');

  const targets = a.targets.map((t) => `<rect class="target ${t.aaa ? 'aaa' : t.aa ? 'aa' : 'fail'}" x="${t.rect.x}" y="${t.rect.y}" width="${t.rect.width}" height="${t.rect.height}"><title>${esc(t.label)} · ${Math.round(t.rect.width)}×${Math.round(t.rect.height)} · ${t.aaa ? 'meets 44px (AAA)' : t.aa ? 'meets 24px (AA), below 44px' : 'below 24px (AA)'}</title></rect>${label(t.rect.x, t.rect.y + t.rect.height + 12, `${Math.round(t.rect.width)}×${Math.round(t.rect.height)}`, `target-l ${t.aaa ? 'aaa' : t.aa ? 'aa' : 'fail'}`)}`).join('');

  const issues = [
    ...a.text.filter((t) => t.aa === false).map((t) => `<rect class="issue" x="${t.rect.x - 2}" y="${t.rect.y - 2}" width="${t.rect.width + 4}" height="${t.rect.height + 4}"><title>Contrast ${t.contrast}:1 is below WCAG AA for ${t.size}px text</title></rect>${label(t.rect.x, t.rect.y - 6, `Contrast ${t.contrast}:1`, 'issue-l')}`),
    ...a.targets.filter((t) => !t.aa).map((t) => `<rect class="issue" x="${t.rect.x - 2}" y="${t.rect.y - 2}" width="${t.rect.width + 4}" height="${t.rect.height + 4}"><title>Target ${Math.round(t.rect.width)}×${Math.round(t.rect.height)} is below 24×24 (WCAG 2.5.8)</title></rect>${label(t.rect.x + t.rect.width + 6, t.rect.y + t.rect.height / 2 + 4, `Target ${Math.round(t.rect.width)}×${Math.round(t.rect.height)} < 24`, 'issue-l')}`),
  ].join('');

  return `<svg class="v-svg" viewBox="0 0 ${a.frame.width} ${a.frame.height}" preserveAspectRatio="none" role="img" aria-label="Measured annotations">
    ${g('spacing', spacing)}${g('type', type)}${g('color', color)}${g('targets', targets)}${g('issues', issues)}</svg>`;
}

export function issueCount(a: Annotations | null | undefined): number {
  return a ? a.text.filter((t) => t.aa === false).length + a.targets.filter((t) => !t.aa).length : 0;
}

function claimList(an: Analysis | null): string {
  if (!an) return '<p class="muted">No lesson for this capture. The annotations are still measured from the page.</p>';
  const item = (c: Claim, kind: string) => {
    const layers = layersForEvidence(c.evidence);
    const name = c.ruleId ? ruleById(c.ruleId)?.name ?? c.ruleId : c.title;
    return `<li tabindex="0" data-layers="${layers.join(' ')}" ${layers.length ? '' : 'class="no-ev"'}><span class="k">${esc(kind)}</span>${name ? `<strong>${esc(name)}</strong>` : ''}<p>${esc(c.text)}</p>${layers.length ? `<span class="shows">Shows: ${layers.map((l) => LAYER_LABELS[l]).join(', ')}</span>` : ''}</li>`;
  };
  const items = [
    ...(an.headline ? [item(an.headline, 'Lesson')] : []),
    ...an.works.map((c) => item(c, 'Works')),
    ...an.watch.map((c) => item(c, 'Watch')),
    ...(an.tradeoff ? [item(an.tradeoff, 'Trade-off')] : []),
    ...an.laws.map((c) => item(c, 'Law')),
  ];
  return `<p class="v-note"><span class="badge inferred">Inferred</span> Hover a point to highlight its measured evidence.</p><ul class="v-claims-list">${items.join('')}</ul>`;
}

export interface ViewerInput {
  title: string;
  subtitle: string;
  /** Markup for the image: <img> in extension pages, <canvas> on websites (page CSP). */
  image: string;
  annotations: Annotations | null | undefined;
  analysis: Analysis | null;
  layers: Layer[];
  actual: boolean;
  canDownload: boolean;
}

export function viewerHTML(v: ViewerInput): string {
  const a = v.annotations;
  const frame = a?.frame;
  const issues = issueCount(a);
  const toggles = LAYERS.map((l) => `<button data-layer="${l}" aria-pressed="${v.layers.includes(l)}" ${a ? '' : 'disabled'}>${LAYER_LABELS[l]}${l === 'issues' && issues ? ` <span class="v-count">${issues}</span>` : ''}</button>`).join('');
  return `<div class="viewer" role="dialog" aria-modal="true" aria-label="Capture viewer">
    <header class="v-head">
      <div class="v-title"><strong>${esc(v.title)}</strong><span>${esc(v.subtitle)}</span></div>
      <div class="v-layers" role="group" aria-label="Measured annotation layers"><span class="badge">Measured</span>${toggles}</div>
      <div class="v-tools"><button data-v="zoom" aria-pressed="${v.actual}">${v.actual ? 'Fit to screen' : 'Actual size'}</button>${v.canDownload ? '<button data-v="download">Download PNG</button>' : ''}<button data-v="close" aria-label="Close viewer">Close <kbd>Esc</kbd></button></div>
    </header>
    <div class="v-main">
      <div class="v-stage${v.actual ? ' actual' : ''}">
        <div class="v-frame" style="${frame ? `aspect-ratio:${frame.width}/${frame.height};width:${v.actual ? `${frame.width}px` : `min(100%, calc((100vh - 120px) * ${n(frame.width / frame.height)}))`};` : ''}">${v.image}${a ? annotationSVG(a, v.layers) : ''}</div>
        ${a ? '' : '<p class="v-missing">This capture was made before measured annotations existed. Capture it again to see spacing, type, color and targets drawn on it.</p>'}
      </div>
      <aside class="v-side">${claimList(v.analysis)}</aside>
    </div>
  </div>`;
}

/**
 * Wire toggles, claim hover and label sizing inside a rendered viewer. Returns a cleanup.
 * `onLayers` persists the layer choice; `onAction` handles zoom/download/close.
 */
export function wireViewer(root: ParentNode, opts: { onLayers: (l: Layer[]) => void; onAction: (a: 'zoom' | 'download' | 'close') => void }): () => void {
  const viewer = root.querySelector<HTMLElement>('.viewer');
  if (!viewer) return () => {};
  const svg = viewer.querySelector<SVGSVGElement>('.v-svg');
  const frame = viewer.querySelector<HTMLElement>('.v-frame');
  // Keep labels a constant on-screen size whatever the zoom.
  const size = () => { if (svg && frame) { const vb = svg.viewBox.baseVal; frame.style.setProperty('--u', String(vb.width / Math.max(1, frame.clientWidth))); } };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(size) : null;
  if (frame) ro?.observe(frame);
  size();
  const focus = (layers: string[] | null) => {
    if (!svg) return;
    svg.classList.toggle('focusing', !!layers?.length);
    svg.querySelectorAll<SVGGElement>('g.layer').forEach((g) => g.classList.toggle('focus', !!layers?.includes(g.dataset.layer!)));
  };
  const onClick = (e: Event) => {
    const t = (e.target as Element).closest<HTMLElement>('button');
    if (!t || !viewer.contains(t)) return;
    if (t.dataset.layer) {
      const pressed = t.getAttribute('aria-pressed') !== 'true';
      t.setAttribute('aria-pressed', String(pressed));
      svg?.querySelector(`g.layer[data-layer="${t.dataset.layer}"]`)?.classList.toggle('off', !pressed);
      opts.onLayers([...viewer.querySelectorAll<HTMLElement>('.v-layers button[aria-pressed="true"]')].map((b) => b.dataset.layer as Layer));
    } else if (t.dataset.v) opts.onAction(t.dataset.v as 'zoom' | 'download' | 'close');
  };
  const over = (e: Event) => { const li = (e.target as Element).closest<HTMLElement>('li[data-layers]'); if (li && viewer.contains(li)) focus(li.dataset.layers!.split(' ').filter(Boolean)); };
  const out = (e: Event) => { const li = (e.target as Element).closest('li[data-layers]'); if (li) focus(null); };
  viewer.addEventListener('click', onClick);
  viewer.addEventListener('mouseover', over);
  viewer.addEventListener('focusin', over);
  viewer.addEventListener('mouseout', out);
  viewer.addEventListener('focusout', out);
  return () => { ro?.disconnect(); viewer.removeEventListener('click', onClick); };
}
