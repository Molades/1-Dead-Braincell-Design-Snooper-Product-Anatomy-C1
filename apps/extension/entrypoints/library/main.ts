import { normalizeAnalysis, type CaptureRecord } from '@pixelpeeper/schema';
import { Store, type CaptureImages } from '@pixelpeeper/store';
import { exportText, FILE_NAMES, GROUPS, type Format, type Group, type Sources } from '../../components/direction';
import type { Tab } from '../../components/lesson';
import { compareView, homeView, ideaView, MAX_COMPARE, type Filter, type Thumbs } from '../../components/library-view';
import '../../components/overlay.css';
import './library.css';

/**
 * The Library tab. Reads and writes the same IndexedDB library as the background worker
 * (same extension origin). Routes: #/  ·  #/idea/<id>  ·  #/compare/<id>,<id>[,<id>]
 */

const store = new Store();
const app = document.getElementById('app')!;
const toastEl = document.querySelector<HTMLElement>('.toast')!;

let records: CaptureRecord[] = [];
const thumbs: Thumbs = {};
let filter: Filter = 'all';
let query = '';
let selected: string[] = [];
let tab: Tab = 'lesson';
let sources: Sources = {};
let format: Format = 'md';
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const dataUrl = (img: { base64: string; mediaType: string } | null | undefined) => (img ? `data:${img.mediaType};base64,${img.base64}` : undefined);

async function load(): Promise<void> {
  records = (await store.list()).map((r) => ({ ...r, analysis: normalizeAnalysis(r.analysis) }));
  selected = selected.filter((id) => records.some((r) => r.id === id && r.saved));
  const missing = records.filter((r) => r.hasImage && !(r.id in thumbs)).map((r) => r.id);
  if (missing.length) {
    const images = await store.images(missing);
    for (const id of missing) thumbs[id] = dataUrl(images[id]?.thumb);
  }
}

function toast(html: string, ms = 5000) {
  clearTimeout(toastTimer);
  toastEl.innerHTML = html;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}

function route(): { name: 'home' } | { name: 'idea'; id: string } | { name: 'compare'; ids: string[] } {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ''));
  // #/?q=<text> opens Home with a search, e.g. "ideas from this site" from the launcher.
  const q = hash.match(/^\/\?q=(.*)$/);
  if (q) { query = q[1]!; filter = 'all'; history.replaceState(null, '', '#/'); }
  const idea = hash.match(/^\/idea\/(.+)$/);
  if (idea) return { name: 'idea', id: idea[1]! };
  const cmp = hash.match(/^\/compare\/(.+)$/);
  if (cmp) return { name: 'compare', ids: cmp[1]!.split(',').filter(Boolean).slice(0, MAX_COMPARE) };
  return { name: 'home' };
}

async function render(): Promise<void> {
  const r = route();
  if (r.name === 'idea') {
    const record = records.find((x) => x.id === r.id);
    if (!record) { app.innerHTML = `<div class="empty"><h2>This capture is no longer in your library</h2><p>It may have been deleted, or it was a Recent capture older than 7 days.</p><a href="#/">Back to Library</a></div>`; return; }
    const images = record.hasImage ? (await store.images([record.id]))[record.id] : undefined;
    document.title = `${record.pattern} — Pixel Peeper Library`;
    app.innerHTML = ideaView({ record, image: dataUrl(images?.full) ?? dataUrl(images?.thumb) ?? null, tab, selected });
    return;
  }
  if (r.name === 'compare') {
    const items = r.ids.map((id) => records.find((x) => x.id === id)).filter((x): x is CaptureRecord => !!x);
    if (items.length < 2) { location.hash = '#/'; return; }
    document.title = 'Compare — Pixel Peeper Library';
    app.innerHTML = compareView({ items, thumbs, sources, format });
    return;
  }
  document.title = 'Pixel Peeper Library';
  const focused = document.activeElement?.classList.contains('search');
  app.innerHTML = homeView({ records, thumbs, filter, query, selected });
  wireFavicons();
  if (focused) { const input = app.querySelector<HTMLInputElement>('.search')!; input.focus(); input.setSelectionRange(query.length, query.length); }
}

/** Swap broken favicons for the letter fallback (inline handlers are blocked by extension CSP). */
function wireFavicons() {
  app.querySelectorAll<HTMLImageElement>('img.fav').forEach((img) => {
    const fail = () => img.remove();
    if (img.complete && img.naturalWidth === 0) fail(); else img.addEventListener('error', fail, { once: true });
    img.addEventListener('load', () => img.classList.add('ok'), { once: true });
  });
}

async function refresh() { await load(); await render(); }

// ---------------------------------------------------------------------------------------------
// Actions

async function keep(id: string) {
  await store.save(id);
  await refresh();
  toast('Saved to your ideas.');
}

async function remove(id: string) {
  const record = records.find((r) => r.id === id);
  if (!record) return;
  const images: CaptureImages | undefined = record.hasImage ? (await store.images([id]))[id] : undefined;
  await store.delete(id);
  selected = selected.filter((x) => x !== id);
  if (route().name === 'idea') location.hash = '#/';
  await refresh();
  toast(`Deleted “${record.pattern}”. <button data-action="undo">Undo</button>`, 7000);
  pendingUndo = async () => { await store.restore(record, images); await refresh(); toast('Restored.'); };
}
let pendingUndo: (() => Promise<void>) | null = null;

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function compareItems(): CaptureRecord[] {
  const r = route();
  return r.name === 'compare' ? r.ids.map((id) => records.find((x) => x.id === id)).filter((x): x is CaptureRecord => !!x) : [];
}

document.addEventListener('click', (e) => {
  const t = (e.target as Element).closest<HTMLElement>('button, [data-filter]');
  if (!t) return;
  const d = t.dataset;
  if (d.filter) { filter = d.filter as Filter; void render(); return; }
  if (d.keep) { void keep(d.keep); return; }
  if (d.delete) { void remove(d.delete); return; }
  if (d.tab) { tab = d.tab as Tab; void render(); return; }
  if (d.toggleCompare) {
    const id = d.toggleCompare;
    if (selected.includes(id)) selected = selected.filter((x) => x !== id);
    else if (selected.length < MAX_COMPARE) selected = [...selected, id];
    else { toast(`Compare up to ${MAX_COMPARE} ideas. Remove one first.`); return; }
    void render();
    return;
  }
  if (d.export) {
    const record = records.find((r) => r.id === d.export);
    if (record) download(exportText([record], {}, format), FILE_NAMES[format]);
    return;
  }
  if (d.format) { format = d.format as Format; void render(); return; }
  switch (d.action) {
    case 'settings': void chrome.runtime.openOptionsPage(); break;
    case 'clear-search': query = ''; filter = 'all'; void render(); break;
    case 'clear-select': selected = []; void render(); break;
    case 'compare': if (selected.length >= 2) { sources = {}; location.hash = `#/compare/${selected.map(encodeURIComponent).join(',')}`; } break;
    case 'undo': { const undo = pendingUndo; pendingUndo = null; toastEl.hidden = true; void undo?.(); break; }
    case 'copy': void navigator.clipboard.writeText(exportText(compareItems(), sources, format)).then(() => toast('Copied.')); break;
    case 'download': download(exportText(compareItems(), sources, format), FILE_NAMES[format]); break;
  }
});

document.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.dataset.select) {
    const id = input.dataset.select;
    selected = input.checked ? [...selected, id].slice(0, MAX_COMPARE) : selected.filter((x) => x !== id);
    void render();
  } else if (input.type === 'radio' && (GROUPS as readonly string[]).includes(input.name)) {
    sources = { ...sources, [input.name as Group]: Number(input.value) };
    void render();
  } else if (input.dataset.title !== undefined) {
    const r = route();
    if (r.name === 'idea' && input.value.trim()) void store.update(r.id, { title: input.value }).then(refresh).then(() => toast('Title saved.'));
  }
});

let noteTimer: ReturnType<typeof setTimeout> | undefined;
document.addEventListener('input', (e) => {
  const el = e.target as HTMLElement;
  if (el.classList.contains('search')) { query = (el as HTMLInputElement).value; void render(); return; }
  if (el.dataset.note !== undefined) {
    const r = route();
    if (r.name !== 'idea') return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { void store.update(r.id, { note: (el as HTMLTextAreaElement).value }).then(load).then(() => toast('Note saved.', 1500)); }, 600);
  }
});

document.addEventListener('keydown', (e) => {
  const el = e.target as HTMLElement;
  if (e.key === 'Enter' && el.dataset.title !== undefined) (el as HTMLInputElement).blur();
  if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); app.querySelector<HTMLInputElement>('.search')?.focus(); }
});

window.addEventListener('hashchange', () => { tab = 'lesson'; window.scrollTo(0, 0); void render(); });

// The overlay saved or captured something in another tab: refresh unless the user is typing here.
chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type !== 'pp:library:changed') return;
  const typing = document.activeElement instanceof HTMLTextAreaElement || document.activeElement?.hasAttribute('data-title');
  if (!typing) void refresh();
});

void refresh();
