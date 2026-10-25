import { Insight, normalizeAnalysis, type CaptureRecord } from '@pixelpeeper/schema';
import { Store, type CaptureImages } from '@pixelpeeper/store';
import { buildDirection, CATEGORIES, directionSummary, exportText, FILE_NAMES, type Category, type Choices, type ExportExtras, type Format } from '../../components/direction';
import type { LessonError } from '../../components/lesson';
import { LESSONS_MODE } from '../../components/mode';
import { activeKey, loadSettings } from '../../components/settings';
import type { Tab } from '../../components/lesson';
import { compareView, homeView, ideaView, MAX_COMPARE, type Filter, type Thumbs } from '../../components/library-view';
import { DEFAULT_LAYERS, viewerHTML, wireViewer, type Layer } from '../../components/viewer';
import '../../components/overlay.css';
import '../../components/viewer.css';
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
/**
 * The open comparison: choices, AI read-across and rationale, saved per set of ideas so
 * reopening it costs no tokens. Keyed by the sorted capture ids.
 */
interface CompareSaved { choices: Choices; readAcross: Insight | null; rationale: { text: string; source: 'inferred' | 'user' } | null }
let cmpKey = '';
let cmp: CompareSaved = { choices: {}, readAcross: null, rationale: null };
let busy: 'readAcross' | 'rationale' | null = null;
let cmpError: (LessonError & { mode: 'readAcross' | 'rationale' }) | null = null;
let hasKey = true;
const keyFor = (ids: string[]) => `direction:${[...ids].sort().join(',')}`;
async function loadCompare(ids: string[]) {
  const key = keyFor(ids);
  if (key === cmpKey) return;
  cmpKey = key; busy = null; cmpError = null;
  const saved = await store.getMeta<CompareSaved>(key);
  const readAcross = Insight.safeParse(saved?.readAcross);
  cmp = { choices: saved?.choices ?? {}, readAcross: readAcross.success ? readAcross.data : null, rationale: saved?.rationale ?? null };
  hasKey = LESSONS_MODE === 'hosted' || !!activeKey(await loadSettings());
}
const saveCompare = () => store.setMeta(cmpKey, cmp);
const extras = (): ExportExtras => ({ readAcross: cmp.readAcross, rationale: cmp.rationale });
let format: Format = 'md';
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let viewerLayers: Layer[] = [...DEFAULT_LAYERS];
let viewerActual = false;
let closeViewer: (() => void) | null = null;

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
    await loadCompare(r.ids);
    app.innerHTML = compareView({ items, thumbs, choices: cmp.choices, format, readAcross: cmp.readAcross, rationale: cmp.rationale, busy, error: cmpError, hasKey });
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
// Capture viewer

async function openViewer(id: string): Promise<void> {
  const record = records.find((r) => r.id === id);
  if (!record) return;
  const images = (await store.images([id]))[id];
  const src = dataUrl(images?.full) ?? dataUrl(images?.thumb);
  if (!src) { toast('No screenshot for this capture.'); return; }
  closeViewer?.();
  const host = document.createElement('div');
  document.body.append(host);
  let cleanup: (() => void) | null = null;
  const draw = () => {
    host.innerHTML = viewerHTML({
      title: record.titleSource === 'user' ? record.title : record.pattern,
      subtitle: `${record.page.siteName} · ${record.page.pageName}`,
      image: `<img src="${src}" alt="">`, annotations: record.annotations, analysis: record.analysis,
      layers: viewerLayers, actual: viewerActual, canDownload: !!record.annotations,
    });
    cleanup?.();
    cleanup = wireViewer(host, {
      onLayers: (l) => { viewerLayers = l; },
      onAction: (a) => {
        if (a === 'close') closeViewer?.();
        else if (a === 'zoom') { viewerActual = !viewerActual; draw(); }
        else void downloadAnnotated(host, record.pattern);
      },
    });
    host.querySelector<HTMLButtonElement>('[data-v="close"]')?.focus();
  };
  closeViewer = () => { cleanup?.(); host.remove(); closeViewer = null; document.body.style.overflow = ''; };
  document.body.style.overflow = 'hidden';
  draw();
}

/** Flatten the screenshot and the visible annotation layers into one PNG at the capture's resolution. */
async function downloadAnnotated(host: HTMLElement, name: string): Promise<void> {
  const img = host.querySelector<HTMLImageElement>('.v-frame > img');
  const svg = host.querySelector<SVGSVGElement>('.v-svg');
  if (!img || !svg) return;
  const w = img.naturalWidth, h = img.naturalHeight;
  // Inline computed styles so the standalone SVG renders like the page.
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll('*')], dst = [clone, ...clone.querySelectorAll('*')];
  const props = ['display', 'opacity', 'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'paint-order', 'stroke-linejoin', 'font', 'vector-effect'];
  src.forEach((el, i) => { const cs = getComputedStyle(el); (dst[i] as SVGElement).setAttribute('style', props.map((p) => `${p}:${cs.getPropertyValue(p)}`).join(';')); });
  clone.querySelectorAll('title').forEach((t) => t.remove());
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const overlay = new Image();
  overlay.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  await overlay.decode();
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  ctx.drawImage(overlay, 0, 0, w, h);
  canvas.toBlob((blob) => { if (blob) { const url = URL.createObjectURL(blob); Object.assign(document.createElement('a'), { href: url, download: `${name.replace(/[^\w\- ]+/g, '').trim() || 'capture'} — annotated.png` }).click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } }, 'image/png');
}

// ---------------------------------------------------------------------------------------------
// Compare: AI read-across and rationale (requests go through the background, which holds the key)

async function interpretComparison(mode: 'readAcross' | 'rationale') {
  const r = route();
  if (r.name !== 'compare' || busy) return;
  const items = compareItems();
  const d = buildDirection(items, cmp.choices);
  busy = mode; cmpError = null;
  await render();
  const res = await chrome.runtime.sendMessage({
    type: 'pp:compare', ids: r.ids, mode,
    ...(mode === 'rationale' ? { direction: directionSummary(d), extraNumbers: d.contrast?.ratio !== undefined ? [d.contrast.ratio] : [] } : {}),
  }).catch(() => undefined) as { insight?: unknown; error?: string; code?: string; retryAfter?: number } | undefined;
  busy = null;
  const insight = Insight.safeParse(res?.insight);
  if (insight.success) {
    if (mode === 'readAcross') cmp.readAcross = insight.data;
    else cmp.rationale = { text: insight.data.claims.map((c) => (c.title ? `${c.title}: ${c.text}` : c.text)).join('\n\n'), source: 'inferred' };
    await saveCompare();
  } else {
    cmpError = { mode, code: res?.code, message: res?.error ?? 'The request did not complete. Try again.', retryAt: res?.retryAfter ? Date.now() + res.retryAfter * 1000 : undefined };
  }
  await render();
}

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
  if (d.view) { void openViewer(d.view); return; }
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
    case 'compare': if (selected.length >= 2) location.hash = `#/compare/${selected.map(encodeURIComponent).join(',')}`; break;
    case 'explain': void interpretComparison('readAcross'); break;
    case 'draft': void interpretComparison('rationale'); break;
    case 'undo': { const undo = pendingUndo; pendingUndo = null; toastEl.hidden = true; void undo?.(); break; }
    case 'copy': void navigator.clipboard.writeText(exportText(compareItems(), cmp.choices, format, extras())).then(() => toast('Copied.')); break;
    case 'download': download(exportText(compareItems(), cmp.choices, format, extras()), FILE_NAMES[format]); break;
  }
});

document.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.dataset.select) {
    const id = input.dataset.select;
    selected = input.checked ? [...selected, id].slice(0, MAX_COMPARE) : selected.filter((x) => x !== id);
    void render();
  } else if (input.type === 'radio' && (CATEGORIES as readonly string[]).includes(input.name)) {
    cmp.choices = { ...cmp.choices, [input.name as Category]: input.value === 'omit' ? 'omit' : Number(input.value) };
    void saveCompare().then(render);
  } else if (input.dataset.title !== undefined) {
    const r = route();
    if (r.name === 'idea' && input.value.trim()) void store.update(r.id, { title: input.value }).then(refresh).then(() => toast('Title saved.'));
  }
});

let noteTimer: ReturnType<typeof setTimeout> | undefined;
document.addEventListener('input', (e) => {
  const el = e.target as HTMLElement;
  if (el.classList.contains('search')) { query = (el as HTMLInputElement).value; void render(); return; }
  if (el.dataset.rationale !== undefined) {
    // Editing turns an AI draft into the user's own text. No re-render, so typing keeps focus.
    const first = cmp.rationale?.source !== 'user';
    cmp.rationale = { text: (el as HTMLTextAreaElement).value, source: 'user' };
    if (first) { const badge = app.querySelector('.rationale-head .badge'); if (badge) { badge.className = 'badge user'; badge.textContent = 'User authored'; } }
    const pre = app.querySelector('.compare pre');
    if (pre) pre.textContent = exportText(compareItems(), cmp.choices, format, extras());
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { void saveCompare(); }, 500);
    return;
  }
  if (el.dataset.note !== undefined) {
    const r = route();
    if (r.name !== 'idea') return;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { void store.update(r.id, { note: (el as HTMLTextAreaElement).value }).then(load).then(() => toast('Note saved.', 1500)); }, 600);
  }
});

document.addEventListener('keydown', (e) => {
  if (closeViewer) { if (e.key === 'Escape') { e.preventDefault(); closeViewer(); } return; }
  const el = e.target as HTMLElement;
  if (e.key === 'Enter' && el.dataset.title !== undefined) (el as HTMLInputElement).blur();
  if (e.key === '/' && document.activeElement === document.body) { e.preventDefault(); app.querySelector<HTMLInputElement>('.search')?.focus(); }
});

window.addEventListener('hashchange', () => { closeViewer?.(); tab = 'lesson'; window.scrollTo(0, 0); void render(); });

// The overlay saved or captured something in another tab: refresh unless the user is typing here.
chrome.runtime.onMessage.addListener((msg: { type?: string }) => {
  if (msg?.type !== 'pp:library:changed') return;
  const typing = document.activeElement instanceof HTMLTextAreaElement || document.activeElement?.hasAttribute('data-title');
  if (!typing) void refresh();
});

void refresh();
