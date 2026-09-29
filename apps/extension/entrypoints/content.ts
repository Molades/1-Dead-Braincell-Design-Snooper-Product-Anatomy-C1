import { measureElement } from '@pixelpeeper/measure';

/** Messages: side panel -> content script */
type Msg = { type: 'pp:start-pick' } | { type: 'pp:stop-pick' };

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const host = document.createElement('pixel-peeper-overlay');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .box{position:fixed;pointer-events:none;border:2px solid #7c3aed;background:rgba(124,58,237,.12);border-radius:2px;display:none}
        .box.sel{border-style:solid;background:rgba(124,58,237,.18)}
        .tag{position:absolute;top:-22px;left:-2px;background:#7c3aed;color:#fff;font:600 11px/18px system-ui;padding:0 6px;border-radius:3px;white-space:nowrap}
      </style>
      <div class="box hover"><span class="tag"></span></div>
      <div class="box sel"><span class="tag"></span></div>`;
    document.documentElement.append(host);

    const hoverBox = root.querySelector<HTMLElement>('.hover')!;
    const selBox = root.querySelector<HTMLElement>('.sel')!;
    let picking = false;
    let hovered: Element | null = null;
    let selected: Element | null = null;

    const place = (box: HTMLElement, el: Element | null) => {
      if (!el) { box.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
      box.querySelector('.tag')!.textContent = `${el.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}`;
    };

    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== host) { hovered = el; place(hoverBox, el); }
    };
    const select = (el: Element) => {
      selected = el;
      place(selBox, el);
      place(hoverBox, null);
      const facts = measureElement(el);
      chrome.runtime.sendMessage({ type: 'pp:selection', facts });
    };
    const onClick = (e: MouseEvent) => {
      if (!hovered) return;
      e.preventDefault();
      e.stopPropagation();
      select(hovered);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
      // Arrow up/down walks parent/child of the current selection.
      if (selected && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        const next = e.key === 'ArrowUp' ? selected.parentElement : selected.firstElementChild;
        if (next && next !== document.documentElement) { e.preventDefault(); select(next); }
      }
    };
    const start = () => {
      if (picking) return;
      picking = true;
      document.addEventListener('mousemove', onMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKey, true);
    };
    const stop = () => {
      picking = false;
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      place(hoverBox, null);
    };

    chrome.runtime.onMessage.addListener((msg: Msg) => {
      if (msg.type === 'pp:start-pick') start();
      if (msg.type === 'pp:stop-pick') stop();
    });
    window.addEventListener('scroll', () => place(selBox, selected), true);
    window.addEventListener('resize', () => place(selBox, selected));
  },
});
