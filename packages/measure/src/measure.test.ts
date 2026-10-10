import { describe, expect, it } from 'vitest';
import { Facts } from '@pixelpeeper/schema';
import { composite, contrastRatio, parseColor, wcagPass } from './color';
import { detectScaleBase, measureElement } from './measure';

describe('color math', () => {
  it('computes WCAG black/white ratio of 21', () => {
    expect(contrastRatio(parseColor('rgb(0,0,0)')!, parseColor('rgb(255,255,255)')!)).toBeCloseTo(21, 1);
  });
  it('#767676 on white is the AA boundary (4.54)', () => {
    const r = contrastRatio(parseColor('rgb(118,118,118)')!, { r: 255, g: 255, b: 255, a: 1 });
    expect(r).toBeCloseTo(4.54, 1);
    expect(wcagPass(r, 16, 400).aa).toBe(true);
  });
  it('applies the large-text threshold', () => {
    expect(wcagPass(3.5, 24, 400).aa).toBe(true);
    expect(wcagPass(3.5, 16, 400).aa).toBe(false);
  });
  it('composites alpha', () => {
    const c = composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255, a: 1 });
    expect(Math.round(c.r)).toBe(128);
  });
});

describe('scale detection', () => {
  it('finds 8', () => expect(detectScaleBase([8, 16, 24])).toBe(8));
  it('finds 4', () => expect(detectScaleBase([4, 12, 20])).toBe(4));
  it('null when off-grid', () => expect(detectScaleBase([5, 13])).toBeNull());
});

describe('measureElement', () => {
  it('produces schema-valid Facts', () => {
    document.body.innerHTML = `<button id="b" style="color:#111;background:#fff;padding:8px 16px;font-size:16px;border-radius:8px">Buy</button><button style="color:#111;background:#fff;padding:8px 16px;font-size:16px;border-radius:8px">Buy 2</button>`;
    const facts = measureElement(document.getElementById('b')!);
    expect(() => Facts.parse(facts)).not.toThrow();
    expect(facts.structure.componentType.value).toBe('button');
    expect(facts.spacing.scaleBase.value).toBe(8);
    expect(facts.color.contrast.canMeasure).toBe(true);
    expect(facts.consistency.sameStyleCount.value).toBe(2);
  });
  
    it('reports cannot-measure over gradients', () => {
    document.body.innerHTML = `<div style="background-image:linear-gradient(red,blue)"><p id="p" style="color:#fff">Hi</p></div>`;
    const facts = measureElement(document.getElementById('p')!);
    expect(facts.color.contrast.canMeasure).toBe(false);
    expect(facts.color.contrast.ratio).toBeNull();
  });

  it('reports cannot-measure when a photo sits behind the element (no CSS background-image involved)', () => {
    // Mirrors a real ad-badge pattern: an <img> absolutely positioned to fill a card, with text
    // overlaid on top via a sibling. No ancestor declares background-image or background-color,
    // so the old logic fell through to the white-canvas default and reported a false 1:1.
    document.body.innerHTML = `
      <div id="card" style="position:relative">
        <img id="photo" src="x.jpg">
        <span id="badge" style="color:#fff">AD</span>
      </div>`;
    const rect = (r: Partial<DOMRect>) => ({ x: 0, y: 0, toJSON() {}, ...r } as DOMRect);
    document.getElementById('badge')!.getBoundingClientRect = () => rect({ left: 0, top: 0, right: 40, bottom: 20, width: 40, height: 20 });
    document.getElementById('photo')!.getBoundingClientRect = () => rect({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 });
    const facts = measureElement(document.getElementById('badge')!);
    expect(facts.color.contrast.canMeasure).toBe(false);
    expect(facts.color.contrast.reason).toMatch(/image/i);
  });

    it('still measures normally when an unrelated, non-overlapping image exists elsewhere on the page', () => {
    document.body.innerHTML = `
      <img id="icon" src="icon.png">
      <p id="p" style="color:#111;background:#fff">Hello</p>`;
    const rect = (r: Partial<DOMRect>) => ({ x: 0, y: 0, toJSON() {}, ...r } as DOMRect);
    document.getElementById('icon')!.getBoundingClientRect = () => rect({ left: 500, top: 500, right: 520, bottom: 520, width: 20, height: 20 });
    document.getElementById('p')!.getBoundingClientRect = () => rect({ left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20 });
    const facts = measureElement(document.getElementById('p')!);
    expect(facts.color.contrast.canMeasure).toBe(true);
  });
});

describe('font family resolution', () => {
  it('resolves to the first named font when document.fonts is unavailable (fallback path, e.g. jsdom)', () => {
    // jsdom has no document.fonts at all, so this exercises the real fallback used in CI/tests.
    document.body.innerHTML = `<p id="p" style="font-family:'Figtree-Regular', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">Hi</p>`;
    const facts = measureElement(document.getElementById('p')!);
    expect(facts.typography.fontFamily.value).toBe('Figtree-Regular');
  });

  it('skips generic/system placeholders when they come first in the stack', () => {
    document.body.innerHTML = `<p id="p" style="font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">Hi</p>`;
    const facts = measureElement(document.getElementById('p')!);
    expect(facts.typography.fontFamily.value).toBe('Segoe UI');
  });

  it('uses document.fonts.check() to find the truly loaded family when that API is present', () => {
    // Mocks a real-browser scenario: the page asked for 'Brand-Sans' first, but only
    // 'Fallback-Serif' is actually loaded, so that's what should be reported as rendering.
    (document as any).fonts = {
      check: (font: string) => font.includes('Fallback-Serif'),
    };
    try {
      document.body.innerHTML = `<p id="p" style="font-family:'Brand-Sans', 'Fallback-Serif', serif">Hi</p>`;
      const facts = measureElement(document.getElementById('p')!);
      expect(facts.typography.fontFamily.value).toBe('Fallback-Serif');
    } finally {
      delete (document as any).fonts; // don't leak the mock into other tests
    }
  });
});