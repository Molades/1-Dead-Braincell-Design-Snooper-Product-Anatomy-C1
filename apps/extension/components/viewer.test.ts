import { describe, expect, it } from 'vitest';
import type { Annotations } from '@pixelpeeper/schema';
import { annotationSVG, issueCount, layersForEvidence, viewerHTML } from './viewer';

const a: Annotations = {
  version: 1, frame: { width: 300, height: 200 },
  box: { rect: { x: 0, y: 0, width: 300, height: 200 }, padding: [24, 24, 24, 24] },
  children: [{ rect: { x: 24, y: 24, width: 252, height: 28 }, label: 'Heading' }],
  gaps: [{ x1: 150, y1: 52, x2: 150, y2: 68, value: 16, axis: 'y' }],
  text: [
    { rect: { x: 24, y: 24, width: 100, height: 28 }, sample: 'Growth', size: 20, weight: 600, lineHeight: 28, color: 'rgb(17, 17, 17)', contrast: 17.4, aa: true },
    { rect: { x: 24, y: 70, width: 100, height: 16 }, sample: 'Fine print', size: 11, weight: 400, lineHeight: null, color: 'rgb(187, 187, 187)', contrast: 1.9, aa: false },
  ],
  targets: [{ rect: { x: 24, y: 120, width: 160, height: 48 }, label: 'Button', aa: true, aaa: true }, { rect: { x: 200, y: 120, width: 16, height: 16 }, label: 'Link', aa: false, aaa: false }],
  swatches: [{ x: 6, y: 6, color: 'rgb(255, 255, 255)', role: 'background' }],
};

describe('viewer', () => {
  it('maps claim evidence to annotation layers', () => {
    expect(layersForEvidence(['typography.fontSize'])).toEqual(['type']);
    expect(layersForEvidence(['color.contrast'])).toEqual(['color', 'issues']);
    expect(layersForEvidence(['spacing.padding', 'a11y.tapTarget'])).toEqual(['spacing', 'targets']);
    expect(layersForEvidence(['rule:wcag-2.5.8-target-size-minimum'])).toEqual(['targets', 'issues']);
    expect(layersForEvidence(['structure.tag'])).toEqual([]);
  });
  it('draws every layer, hiding the ones not switched on', () => {
    const svg = annotationSVG(a, ['spacing']);
    expect(svg).toContain('viewBox="0 0 300 200"');
    expect(svg).toMatch(/class="layer spacing"/);
    expect(svg).toMatch(/class="layer type off"/);
    expect(svg).toContain('>16<');          // gap label
    expect(svg).toContain('20/28 · 600');   // type label
    expect(svg).toContain('Contrast 1.9:1'); // issue on the faint text
    expect(svg).toContain('Target 16×16 &lt; 24');
  });
  it('counts issues and explains captures without annotations', () => {
    expect(issueCount(a)).toBe(2);
    expect(issueCount(null)).toBe(0);
    const html = viewerHTML({ title: 'Card', subtitle: 'Site · Page', image: '<img src="x">', annotations: null, analysis: null, layers: [], actual: false, canDownload: false });
    expect(html).toContain('before measured annotations existed');
    expect(html).toMatch(/data-layer="spacing" aria-pressed="false" disabled/);
  });
  it('escapes captured text in labels and tooltips', () => {
    const bad = { ...a, text: [{ ...a.text[0]!, sample: '<script>x</script>' }] };
    expect(annotationSVG(bad, ['type'])).not.toContain('<script>');
  });
});
