import type { Annotations } from '@pixelpeeper/schema';
import { composite, contrastRatio, parseColor, toCss, wcagPass } from './color';
import { effectiveBackground } from './measure';

/**
 * Measured layout inside a captured frame: boxes, gaps, text runs, targets and colors,
 * relative to the frame so they line up with the screenshot. Deterministic; no inference.
 */

type Frame = { x: number; y: number; width: number; height: number };
const LIMITS = { children: 24, text: 60, targets: 40, swatches: 12 };
const INTERACTIVE = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=checkbox],[role=switch]';
const r1 = (n: number) => Math.round(n * 10) / 10;

function rel(r: DOMRect, f: Frame) {
  return { x: r1(r.left - f.x), y: r1(r.top - f.y), width: r1(r.width), height: r1(r.height) };
}
const visibleIn = (r: DOMRect, f: Frame) => r.width > 0 && r.height > 0 && r.right > f.x && r.bottom > f.y && r.left < f.x + f.width && r.top < f.y + f.height;
const isShown = (el: Element) => { const cs = el.ownerDocument.defaultView!.getComputedStyle(el); return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0'; };

const LABELS: Record<string, string> = { a: 'Link', button: 'Button', img: 'Image', svg: 'Icon', input: 'Input', p: 'Text', span: 'Text', li: 'Item', ul: 'List', h1: 'Heading', h2: 'Heading', h3: 'Heading', h4: 'Heading', nav: 'Nav', form: 'Form', section: 'Section', header: 'Header', footer: 'Footer' };
const label = (el: Element) => LABELS[el.tagName.toLowerCase()] ?? el.tagName.toLowerCase();

/** Bounding box of an element's own (direct) text, so labels sit on the words, not the whole box. */
function ownTextRect(el: Element): DOMRect | null {
  const nodes = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent!.trim());
  if (!nodes.length) return null;
  const range = el.ownerDocument.createRange();
  range.setStartBefore(nodes[0]!);
  range.setEndAfter(nodes[nodes.length - 1]!);
  const r = range.getBoundingClientRect?.();
  return r && r.width > 0 ? r : el.getBoundingClientRect();
}

export function measureLayout(root: Element, frame: Frame, scope: 'element' | 'page' = 'element'): Annotations {
  const win = root.ownerDocument.defaultView!;
  const cs = win.getComputedStyle(root);
  const px = (v: string) => parseFloat(v) || 0;
  const out: Annotations = {
    version: 1,
    frame: { width: r1(frame.width), height: r1(frame.height) },
    box: scope === 'page' ? null : { rect: rel(root.getBoundingClientRect(), frame), padding: [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)] },
    children: [], gaps: [], text: [], targets: [], swatches: [],
  };

  // Direct children (element scope) or the page's top-level blocks (page scope), and the gaps between neighbours.
  const level = scope === 'page' ? [...(root.ownerDocument.body?.children ?? [])] : [...root.children];
  const kids = level.filter((c) => isShown(c) && visibleIn(c.getBoundingClientRect(), frame)).slice(0, LIMITS.children);
  out.children = kids.map((c) => ({ rect: rel(c.getBoundingClientRect(), frame), label: label(c) }));
  for (let i = 1; i < kids.length; i++) {
    const a = kids[i - 1]!.getBoundingClientRect(), b = kids[i]!.getBoundingClientRect();
    if (b.top >= a.bottom - 0.5) { // stacked
      const gap = b.top - a.bottom;
      const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
      if (gap >= 1) out.gaps.push({ x1: r1(x - frame.x), y1: r1(a.bottom - frame.y), x2: r1(x - frame.x), y2: r1(b.top - frame.y), value: r1(gap), axis: 'y' });
    } else if (b.left >= a.right - 0.5) { // side by side
      const gap = b.left - a.right;
      const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
      if (gap >= 1) out.gaps.push({ x1: r1(a.right - frame.x), y1: r1(y - frame.y), x2: r1(b.left - frame.x), y2: r1(y - frame.y), value: r1(gap), axis: 'x' });
    }
  }

  // Text runs and interactive targets anywhere inside the frame.
  // Reject the extension's own overlay together with everything inside it.
  const walker = root.ownerDocument.createTreeWalker(scope === 'page' ? root.ownerDocument.body ?? root : root, NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => ((n as Element).tagName === 'PIXEL-PEEPER-OVERLAY' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const seenColors = new Set<string>();
  for (let el: Element | null = walker.currentNode as Element; el; el = walker.nextNode() as Element | null) {
    if (!isShown(el)) continue;
    const ecs = win.getComputedStyle(el);
    if (out.text.length < LIMITS.text) {
      const tr = ownTextRect(el);
      if (tr && visibleIn(tr, frame)) {
        const fg = parseColor(ecs.color), bg = effectiveBackground(el).color;
        const size = px(ecs.fontSize), weight = parseInt(ecs.fontWeight, 10) || 400;
        const ratio = fg && bg ? contrastRatio(composite(fg, bg), bg) : null;
        out.text.push({
          rect: rel(tr, frame), sample: (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40), size, weight,
          lineHeight: ecs.lineHeight === 'normal' || !ecs.lineHeight ? null : px(ecs.lineHeight), color: ecs.color,
          contrast: ratio === null ? null : Math.round(ratio * 100) / 100, aa: ratio === null ? null : wcagPass(ratio, size, weight).aa,
        });
      }
    }
    if (out.targets.length < LIMITS.targets && el.matches(INTERACTIVE)) {
      const r = el.getBoundingClientRect();
      if (visibleIn(r, frame) && !(el.tagName === 'A' && ecs.display === 'inline')) {
        const small = Math.min(r.width, r.height);
        out.targets.push({ rect: rel(r, frame), label: label(el), aa: small >= 24, aaa: small >= 44 });
      }
    }
    const bgc = parseColor(ecs.backgroundColor);
    if (out.swatches.length < LIMITS.swatches && bgc && bgc.a > 0) {
      const r = el.getBoundingClientRect(), css = toCss(bgc);
      if (visibleIn(r, frame) && !seenColors.has(css)) {
        seenColors.add(css);
        out.swatches.push({ x: r1(Math.max(r.left, frame.x) - frame.x + 6), y: r1(Math.max(r.top, frame.y) - frame.y + 6), color: css, role: 'background' });
      }
    }
  }
  return out;
}
