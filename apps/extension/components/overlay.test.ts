import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { Store } from '@pixelpeeper/store';
import { createOverlay } from './overlay';

type Msg = { type: string; [k: string]: unknown };

/** A stand-in for the background worker: real library store on an in-memory database. */
function fakeBackground(opts: { hasKey?: boolean; thumb?: unknown; analysis?: unknown } = {}) {
  const store = new Store(new IDBFactory());
  const calls: Msg[] = [];
  const handle = async (m: Msg): Promise<unknown> => {
    calls.push(m);
    switch (m.type) {
      case 'pp:status': return { hasKey: !!opts.hasKey };
      case 'pp:capture': return { image: { base64: 'BBBB', mediaType: 'image/png' }, thumb: opts.thumb, full: opts.thumb };
      case 'pp:analyze': return { analysis: opts.analysis };
      case 'pp:store:put': return { record: await store.put(m.record as never, m.images as never) };
      case 'pp:store:save': return { record: await store.save(m.id as string) };
      case 'pp:store:list': return { records: await store.list(m.query as never) };
      case 'pp:store:delete': await store.delete(m.id as string); return { ok: true };
      case 'pp:store:images': return { images: await store.images(m.ids as string[]) };
    }
  };
  return { store, calls, sendMessage: vi.fn(handle) };
}

describe('floating extension lifecycle', () => {
  let ui: ReturnType<typeof createOverlay>;
  let host: HTMLElement;
  let root: ShadowRoot;
  let bg: ReturnType<typeof fakeBackground>;
  const button = (action: string) => root.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
  // Advance the overlay's fake timers and let real event-loop turns run for IndexedDB.
  const settle = async (ms = 1500) => { for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(ms / 10); await new Promise((r) => setImmediate(r)); } };
  function setup(opts?: Parameters<typeof fakeBackground>[0]) {
    bg = fakeBackground(opts);
    vi.stubGlobal('chrome', { runtime: { id: 'test-extension', getURL: (s: string) => s, sendMessage: bg.sendMessage } });
    ui = createOverlay(); host = document.querySelector('pixel-peeper-overlay')!; root = host.shadowRoot!;
  }
  beforeEach(() => {
    // Fake only the overlay's timers; IndexedDB (fake-indexeddb) schedules with setImmediate.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    document.title = 'Plans and pricing | Northwind';
    document.body.innerHTML = '<button id="subject" style="padding:16px;color:black;background:white">Inspect me</button>';
    document.elementFromPoint = () => document.getElementById('subject');
  });
  afterEach(() => { ui.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });
  function select() { ui.pick(); document.getElementById('subject')!.click(); }

  it('stays invisible until activation and never reserves webpage width', () => {
    setup();
    expect(host.style.display).toBe('none'); ui.activate(); expect(host.style.display).toBe('block'); expect(host.style.position).toBe('fixed');
    expect(root.querySelector<HTMLElement>('.window')!.hidden).toBe(true); ui.deactivate(); expect(host.style.display).toBe('none');
  });

  it('does not inspect the extension controls while picking', () => {
    setup();
    ui.pick(); root.querySelector<HTMLButtonElement>('.mascot')!.click();
    expect(root.querySelector<HTMLElement>('.selected')!.style.display).not.toBe('block');
  });

  it('cancels pending measurements when picking again', async () => {
    setup();
    select(); button('scan').click(); ui.pick(); await settle();
    expect(root.querySelector<HTMLElement>('.window')!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>('.scan')!.hidden).toBe(true);
  });

  it('puts every finished capture in Recent with a readable title', async () => {
    setup();
    select(); button('scan').click(); await settle();
    const [rec] = await bg.store.list();
    expect(rec!.saved).toBe(false);
    expect(rec!.title).toBe('Button “Inspect me” — Localhost · Plans and pricing');
    expect(root.querySelector('.lesson-head h2')!.textContent).toBe('Button “Inspect me”');
    expect(root.querySelector('.lesson-head .muted')!.textContent).toContain('Localhost · Plans and pricing');
  });

  it('saves once, then shows the saved state', async () => {
    setup();
    select(); button('scan').click(); await settle();
    button('save').click(); await settle(200);
    expect((await bg.store.list({ saved: true }))).toHaveLength(1);
    expect(root.querySelector('.saved-state')).not.toBeNull();
    expect(root.querySelector('[data-action="save"]')).toBeNull();
    expect(bg.calls.filter((c) => c.type === 'pp:store:save')).toHaveLength(1);
  });

  it('stores the capture images with the record and the lesson once it arrives', async () => {
    const thumb = { base64: 'AAAA', mediaType: 'image/jpeg', width: 10, height: 8 };
    const analysis = { version: 2, scope: 'element', headline: null, role: { id: 'r', text: 'Main action.', label: 'inferred', evidence: ['structure.tag'], title: 'Primary call-to-action' }, technique: null, works: [], watch: [], tradeoff: null, steal: [], laws: [], visualOnly: [], vocabulary: [], rejected: [], modelInfo: { provider: 'groq', model: 'm' }, rulesLibraryVersion: '0.1.0', createdAt: '2026-10-13T00:00:00Z' };
    setup({ hasKey: true, thumb, analysis });
    select(); button('scan').click(); await settle(3000);
    expect(root.querySelector('canvas[data-thumb="current"]')).not.toBeNull();
    const [rec] = await bg.store.list();
    expect(rec!.analysis).toEqual(analysis);
    expect(rec!.title).toBe('Primary call-to-action — Localhost · Plans and pricing');
    expect(rec!.hasImage).toBe(true);
    expect((await bg.store.images([rec!.id]))[rec!.id]!.thumb).toEqual(thumb);
    expect(rec!.annotations?.version).toBe(1);
    root.querySelector<HTMLButtonElement>('[data-action="view"]')!.click(); await settle(200);
    expect(root.querySelector('.viewer')).not.toBeNull();
    expect(root.querySelector('.v-svg')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(root.querySelector('.viewer')).toBeNull();
    expect(root.querySelector<HTMLElement>('.window')!.hidden).toBe(false);
  });

  it('opens the Library tab from the launcher, and on the saved capture from the lesson', async () => {
    setup();
    select(); button('scan').click(); await settle();
    root.querySelector<HTMLButtonElement>('.dock [data-action="library"]')!.click(); await settle(200);
    expect(bg.calls.some((c) => c.type === 'pp:open-library' && c.id === undefined)).toBe(true);
    button('save').click(); await settle(200);
    root.querySelector<HTMLButtonElement>('.saved-state')!.click(); await settle(200);
    const [rec] = await bg.store.list({ saved: true });
    expect(bg.calls.some((c) => c.type === 'pp:open-library' && c.id === rec!.id)).toBe(true);
  });

  it('lets ↑ widen the hovered target before clicking, and selects what was shown', () => {
    setup();
    document.body.innerHTML = '<section id="sec"><div id="card" style="border:1px solid #ddd"><h3>Plan</h3><button id="subject"><span id="label">Buy</span></button></div></section>';
    document.elementFromPoint = () => document.getElementById('label');
    ui.pick();
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    document.getElementById('label')!.click();
    expect(root.querySelector('.crumbs [aria-current="true"]')!.textContent).toBe('Card');
  });

  it('shows Get lesson with a breadcrumb; Bigger, Smaller and crumbs change the level; nothing is sent before Get lesson', async () => {
    setup();
    document.body.innerHTML = '<section id="sec"><div id="card" style="border:1px solid #ddd"><h3>Plan</h3><button id="subject"><span id="label">Buy</span></button></div></section>';
    document.elementFromPoint = () => document.getElementById('label');
    select();
    const current = () => root.querySelector('.crumbs [aria-current="true"]')!.textContent;
    expect(current()).toBe('Button');
    expect([...root.querySelectorAll('.crumbs button')].map((b) => b.textContent)).toEqual(['Section', 'Card', 'Button']);
    button('bigger').click(); expect(current()).toBe('Card');
    button('smaller').click(); expect(current()).toBe('Button');
    root.querySelector<HTMLButtonElement>('[data-crumb="0"]')!.click(); expect(current()).toBe('Section');
    await settle(200);
    expect(bg.calls.some((c) => c.type === 'pp:capture' || c.type === 'pp:store:put')).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(bg.calls.some((c) => c.type === 'pp:store:put')).toBe(true);
  });

  it('shows how many ideas were saved from this site', async () => {
    setup();
    select(); button('scan').click(); await settle();
    button('save').click(); await settle(300);
    expect(root.querySelector<HTMLElement>('.site-count')!.hidden).toBe(false);
    expect(root.querySelector('.site-count')!.textContent).toBe('1');
    root.querySelector<HTMLButtonElement>('.site-ideas')!.click(); await settle(100);
    expect(bg.calls.some((c) => c.type === 'pp:open-library' && c.query === location.hostname)).toBe(true);
  });

  it('tells the user to reload when the extension was updated underneath the page', async () => {
    setup();
    (chrome.runtime as { id?: string }).id = undefined;
    select(); button('scan').click(); await settle(200);
    expect(root.querySelector('.feedback')!.textContent).toMatch(/Reload this page/);
  });

  it('exports Markdown and CSS with actual line breaks', async () => {
    setup();
    select(); button('scan').click(); await settle(); button('export').click();
    expect(root.querySelector('pre')!.textContent).toContain('# Design direction\n\n## Measured');
    root.querySelector<HTMLButtonElement>('[data-format="css"]')!.click();
    expect(root.querySelector('pre')!.textContent).toContain(':root {\n --font-family:');
    expect(root.querySelector('pre')!.textContent).not.toContain('\\n');
  });
});
