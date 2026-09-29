import type { Facts } from '@pixelpeeper/schema';
import { composite, contrastRatio, parseColor, toCss, wcagPass, type RGBA } from './color';
import { cssPath } from './selector';
import { accessibleName, componentType, depthOf } from './structure';

const px = (v: string) => (v === '' || v === 'normal' || v === 'auto' ? 0 : parseFloat(v) || 0);
const F = <T,>(value: T, source: 'computed' | 'attribute' | 'derived' = 'computed') => ({ value, source });

const FINGERPRINT_PROPS = [
  'font-family', 'font-size', 'font-weight', 'color', 'background-color', 'border-radius',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'box-shadow',
];

function fingerprint(cs: CSSStyleDeclaration): string {
  return FINGERPRINT_PROPS.map((p) => cs.getPropertyValue(p)).join('|');
}

/**
 * Walk ancestors compositing backgrounds. Returns null (can't measure) if an image or gradient
 * is met before an opaque color is reached.
 */
export function effectiveBackground(el: Element): { color: RGBA | null; reason?: string } {
  const layers: RGBA[] = [];
  const win = el.ownerDocument.defaultView!;
  for (let n: Element | null = el; n; n = n.parentElement) {
    const cs = win.getComputedStyle(n);
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      return { color: null, reason: 'Background is an image or gradient' };
    }
    const c = parseColor(cs.backgroundColor);
    if (c && c.a > 0) {
      layers.push(c);
      if (c.a >= 1) break;
    }
  }
  let base: RGBA = { r: 255, g: 255, b: 255, a: 1 }; // browser default canvas
  for (const layer of layers.reverse()) base = composite(layer, base);
  return { color: base };
}

/** Largest of 8 / 4 dividing every non-zero value (within 0.5px), else null. */
export function detectScaleBase(values: number[]): number | null {
  const nz = values.filter((v) => v > 0);
  if (!nz.length) return null;
  for (const base of [8, 4]) {
    if (nz.every((v) => Math.abs(v / base - Math.round(v / base)) * base < 0.5)) return base;
  }
  return null;
}

export function measureElement(el: Element): Facts {
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const cs = win.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const fontSize = px(cs.fontSize);
  const fontWeight = parseInt(cs.fontWeight, 10) || 400;

  const padding: [number, number, number, number] = [px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom), px(cs.paddingLeft)];
  const margin: [number, number, number, number] = [px(cs.marginTop), px(cs.marginRight), px(cs.marginBottom), px(cs.marginLeft)];
  const gapRaw = cs.gap && cs.gap !== 'normal' ? px(cs.gap.split(' ')[0]!) : null;

  // Contrast
  const fg = parseColor(cs.color);
  const bg = effectiveBackground(el);
  let contrast: Facts['color']['contrast'];
  if (!fg || !bg.color) {
    contrast = { canMeasure: false, reason: bg.reason ?? 'Color could not be parsed', ratio: null, foreground: cs.color, background: null, aa: null, aaa: null, source: 'derived' };
  } else {
    const fgOver = composite(fg, bg.color);
    const ratio = contrastRatio(fgOver, bg.color);
    const pass = wcagPass(ratio, fontSize, fontWeight);
    contrast = { canMeasure: true, ratio: +ratio.toFixed(2), foreground: toCss(fgOver), background: toCss(bg.color), aa: pass.aa, aaa: pass.aaa, source: 'derived' };
  }

  // Consistency
  const fp = fingerprint(cs);
  let same = 0;
  for (const n of doc.querySelectorAll('body *')) if (fingerprint(win.getComputedStyle(n)) === fp) same++;

  const isFlex = cs.display.includes('flex');
  const isGrid = cs.display.includes('grid');
  const radius = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(px);
  const role = el.getAttribute('role');

  return {
    schemaVersion: 0,
    url: win.location.href,
    capturedAt: new Date().toISOString(),
    selector: cssPath(el),
    typography: {
      fontFamily: F(cs.fontFamily),
      fontSize: F(fontSize),
      fontWeight: F(fontWeight),
      lineHeight: F(cs.lineHeight === 'normal' ? null : px(cs.lineHeight)),
      letterSpacing: F(px(cs.letterSpacing)),
      textAlign: F(cs.textAlign),
    },
    color: {
      text: F(cs.color),
      background: F(cs.backgroundColor),
      border: F(cs.borderTopColor),
      opacity: F(cs.opacity === '' ? 1 : parseFloat(cs.opacity)),
      contrast,
    },
    spacing: {
      padding: F(padding),
      margin: F(margin),
      gap: F(gapRaw),
      scaleBase: F(detectScaleBase([...padding, ...margin, ...(gapRaw ? [gapRaw] : [])]), 'derived'),
    },
    size: {
      width: F(+rect.width.toFixed(2)),
      height: F(+rect.height.toFixed(2)),
      aspectRatio: F(rect.height ? +(rect.width / rect.height).toFixed(3) : 0, 'derived'),
      position: F({ x: Math.round(rect.left + win.scrollX), y: Math.round(rect.top + win.scrollY), width: rect.width, height: rect.height }),
    },
    shape: {
      borderWidth: F(px(cs.borderTopWidth)),
      borderStyle: F(cs.borderTopStyle),
      borderRadius: F(radius),
      boxShadow: F(cs.boxShadow),
      backgroundImage: F(cs.backgroundImage),
    },
    layout: {
      display: F(cs.display),
      flexDirection: F(isFlex ? cs.flexDirection : null),
      alignItems: F(isFlex || isGrid ? cs.alignItems : null),
      justifyContent: F(isFlex || isGrid ? cs.justifyContent : null),
      gridTemplateColumns: F(isGrid ? cs.gridTemplateColumns : null),
    },
    structure: {
      tag: F(el.tagName.toLowerCase(), 'attribute'),
      role: F(role, 'attribute'),
      depth: F(depthOf(el), 'derived'),
      childCount: F(el.children.length, 'derived'),
      componentType: F(componentType(el), 'derived'),
    },
    a11y: {
      tapTarget: F({ width: rect.width, height: rect.height, meets44: rect.width >= 44 && rect.height >= 44 }, 'derived'),
      minTextSize: F(el.textContent?.trim() ? fontSize : null, 'derived'),
      accessibleName: F(accessibleName(el), 'derived'),
      altText: F(el.tagName === 'IMG' ? el.getAttribute('alt') : null, 'attribute'),
    },
    consistency: { sameStyleCount: F(same, 'derived') },
  };
}
