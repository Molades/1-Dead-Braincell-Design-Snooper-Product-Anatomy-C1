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
});
