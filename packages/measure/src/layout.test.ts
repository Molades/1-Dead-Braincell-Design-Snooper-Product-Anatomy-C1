import { afterEach, describe, expect, it } from 'vitest';
import { Annotations } from '@pixelpeeper/schema';
import { measureLayout } from './layout';

/** jsdom has no layout; give elements explicit boxes by id. */
const boxes = new Map<Element, DOMRect>();
const original = Element.prototype.getBoundingClientRect;
function layout(map: Record<string, [number, number, number, number]>) {
  for (const [id, [x, y, w, h]] of Object.entries(map)) boxes.set(document.getElementById(id)!, new DOMRect(x, y, w, h));
  Element.prototype.getBoundingClientRect = function () { return boxes.get(this) ?? new DOMRect(0, 0, 0, 0); };
}
afterEach(() => { Element.prototype.getBoundingClientRect = original; boxes.clear(); document.body.innerHTML = ''; });

describe('measureLayout', () => {
  it('records the box, children and the gaps between them relative to the frame', () => {
    document.body.innerHTML = `<div id="card" style="padding:24px;background:#fff">
      <h3 id="h" style="color:#111;font-size:20px">Growth</h3><p id="p" style="color:#666;font-size:14px">Room to build</p><button id="b" style="font-size:14px;color:#fff;background:#111">Choose</button></div>`;
    layout({ card: [100, 200, 300, 260], h: [124, 224, 252, 28], p: [124, 268, 252, 20], b: [124, 312, 160, 48] });
    const a = measureLayout(document.getElementById('card')!, { x: 100, y: 200, width: 300, height: 260 });
    expect(() => Annotations.parse(a)).not.toThrow();
    expect(a.box).toEqual({ rect: { x: 0, y: 0, width: 300, height: 260 }, padding: [24, 24, 24, 24] });
    expect(a.children.map((c) => c.label)).toEqual(['Heading', 'Text', 'Button']);
    expect(a.gaps.map((g) => [g.axis, g.value])).toEqual([['y', 16], ['y', 24]]);
    expect(a.gaps[0]).toMatchObject({ y1: 52, y2: 68 });
  });

  it('measures text runs with their own contrast, and targets against 24 / 44', () => {
    document.body.innerHTML = `<div id="card" style="background:#fff"><p id="p" style="color:#bbb;font-size:12px">Faint</p><a id="a" href="#" style="display:inline-block;color:#111">Go</a></div>`;
    layout({ card: [0, 0, 200, 100], p: [10, 10, 100, 16], a: [10, 40, 30, 30] });
    const a = measureLayout(document.getElementById('card')!, { x: 0, y: 0, width: 200, height: 100 });
    const faint = a.text.find((t) => t.sample === 'Faint')!;
    expect(faint.aa).toBe(false);
    expect(faint.size).toBe(12);
    expect(String(faint.contrast)).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(a.targets).toEqual([{ rect: { x: 10, y: 40, width: 30, height: 30 }, label: 'Link', aa: true, aaa: false }]);
    expect(a.swatches[0]!.color).toBe('rgb(255, 255, 255)');
  });

  it('ignores anything outside the frame and the extension overlay', () => {
    document.body.innerHTML = `<div id="card"><button id="in">In</button><button id="out">Out</button><pixel-peeper-overlay><button id="pp">x</button></pixel-peeper-overlay></div>`;
    layout({ card: [0, 0, 100, 100], in: [10, 10, 40, 40], out: [500, 500, 40, 40], pp: [10, 60, 40, 40] });
    const a = measureLayout(document.getElementById('card')!, { x: 0, y: 0, width: 100, height: 100 });
    expect(a.targets.map((t) => t.label)).toEqual(['Button']);
    expect(a.targets).toHaveLength(1);
  });
});
