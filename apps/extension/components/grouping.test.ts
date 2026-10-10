import { afterEach, describe, expect, it } from 'vitest';
import { boundaryReason, snapToComponent } from './grouping';

const $ = (id: string) => document.getElementById(id)!;
afterEach(() => { document.body.innerHTML = ''; });

describe('component snapping', () => {
  it('snaps text inside a card to the card', () => {
    document.body.innerHTML = `<div style="background:#fff"><div id="card" style="border:1px solid #ddd;border-radius:12px">
      <div><h3>Growth</h3><p id="copy">Room to build</p></div></div></div>`;
    expect(snapToComponent($('copy')).el).toBe($('card'));
    expect(snapToComponent($('copy')).reason).toBe('container');
  });
  it('snaps a span inside a button to the button', () => {
    document.body.innerHTML = '<div class="card" style="box-shadow:0 1px 2px #0002"><button id="b"><span id="s">Buy</span></button></div>';
    expect(snapToComponent($('s')).el).toBe($('b'));
  });
  it('snaps to a list item when there is no visual container', () => {
    document.body.innerHTML = '<ul><li id="li"><div><strong id="t">Item</strong></div></li></ul>';
    expect(snapToComponent($('t')).el).toBe($('li'));
  });
  it('treats a background matching the parent as no boundary', () => {
    document.body.innerHTML = '<div style="background:#fff"><div id="same" style="background:#fff">x</div></div>';
    expect(boundaryReason($('same'))).toBeNull();
  });
  it('falls back to the element itself when nothing qualifies', () => {
    document.body.innerHTML = '<div><div><span id="x">plain</span></div></div>';
    expect(snapToComponent($('x')).el).toBe($('x'));
  });
});
