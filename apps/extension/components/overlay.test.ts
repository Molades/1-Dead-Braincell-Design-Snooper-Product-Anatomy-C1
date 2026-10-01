import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOverlay } from './overlay';

describe('floating extension lifecycle', () => {
  let ui:ReturnType<typeof createOverlay>;
  let host:HTMLElement;
  let root:ShadowRoot;
  const storageSet=vi.fn().mockResolvedValue(undefined);
  const button=(action:string)=>root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  beforeEach(()=>{
    vi.useFakeTimers();storageSet.mockClear();
    vi.stubGlobal('chrome',{runtime:{getURL:(s:string)=>s},storage:{local:{get:vi.fn().mockResolvedValue({}),set:storageSet}}});
    document.body.innerHTML='<button id="subject" style="padding:16px;color:black;background:white">Inspect me</button>';
    ui=createOverlay();host=document.querySelector('pixel-peeper-overlay')!;root=host.shadowRoot!;
  });
  afterEach(()=>{ui.destroy();vi.useRealTimers();vi.unstubAllGlobals();document.body.innerHTML='';});
  function select(){ui.pick();document.getElementById('subject')!.click();}
  it('stays invisible until activation and never reserves webpage width',()=>{
    expect(host.style.display).toBe('none');ui.activate();expect(host.style.display).toBe('block');expect(host.style.position).toBe('fixed');expect(root.querySelector<HTMLElement>('.window')!.hidden).toBe(true);ui.deactivate();expect(host.style.display).toBe('none');
  });
  it('does not inspect the extension controls while picking',()=>{
    ui.pick();root.querySelector<HTMLButtonElement>('.mascot')!.click();expect(root.querySelector<HTMLElement>('.selected')!.style.display).not.toBe('block');
  });
  it('cancels pending measurements when picking again',async()=>{
    // jsdom has no hit-testing; point at the fixture for a real page selection.
    document.elementFromPoint=()=>document.getElementById('subject');select();button('scan').click();ui.pick();await vi.advanceTimersByTimeAsync(1000);expect(root.querySelector<HTMLElement>('.window')!.hidden).toBe(true);expect(root.querySelector<HTMLElement>('.scan')!.hidden).toBe(true);
  });
  it('saves measured facts only after analysis and does not duplicate saves',async()=>{
    document.elementFromPoint=()=>document.getElementById('subject');select();button('scan').click();await vi.advanceTimersByTimeAsync(1000);button('save').click();await Promise.resolve();expect(storageSet).toHaveBeenCalledTimes(1);const stored=Object.values(storageSet.mock.calls[0][0])[0] as {facts:{typography:{fontSize:{value:number}}}}[];expect(stored[0].facts.typography.fontSize.value).toBeTypeOf('number');button('save').click();await Promise.resolve();expect(storageSet).toHaveBeenCalledTimes(1);
  });
  it('exports Markdown and CSS with actual line breaks',async()=>{
    document.elementFromPoint=()=>document.getElementById('subject');select();button('scan').click();await vi.advanceTimersByTimeAsync(1000);button('export').click();
    expect(root.querySelector('pre')!.textContent).toContain('# Design direction\n\n## Measured');
    root.querySelector<HTMLButtonElement>('[data-format="css"]')!.click();
    expect(root.querySelector('pre')!.textContent).toContain(':root {\n --font-family:');
    expect(root.querySelector('pre')!.textContent).not.toContain('\\n');
  });

});
