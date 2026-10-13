import { analyze, AnalysisError } from '@pixelpeeper/analysis';
import { evaluate } from '@pixelpeeper/rules';
import { CaptureRecord, Facts, normalizeAnalysis, type StoredImage } from '@pixelpeeper/schema';
import { Store, type ListQuery } from '@pixelpeeper/store';
import { captureTitle, pageNameFrom, patternName, siteNameFromHost } from '@pixelpeeper/measure';
import { activeKey, activeModel, loadSettings, PROVIDERS } from '../components/settings';
/** Long edge cap for the screenshot; larger images are downscaled before upload. */
const MAX_EDGE = 1568;
/** Long edge for the saved thumbnail shown in the lesson header and library. */
const THUMB_EDGE = 640;

type Rect = { x: number; y: number; width: number; height: number };
type Image = { base64: string; mediaType: 'image/png' };
type Thumb = StoredImage;

const store = new Store();
type Msg =
  | { type: 'pp:status' }
  | { type: 'pp:open-options' }
  | { type: 'pp:capture'; rect: Rect; dpr: number }
  | { type: 'pp:analyze'; facts: unknown; scope: 'element' | 'page'; image: Image }
  | { type: 'pp:store:put'; record: unknown; images?: { thumb: Thumb | null; full: Thumb | null } }
  | { type: 'pp:store:save'; id: string; title?: string; note?: string }
  | { type: 'pp:store:get'; id: string }
  | { type: 'pp:store:list'; query?: ListQuery }
  | { type: 'pp:store:delete'; id: string }
  | { type: 'pp:store:images'; ids: string[] }
  | { type: 'pp:open-library'; id?: string };


function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Capture the visible tab and crop to the selection's visible bounds: full size for the model, a JPEG thumbnail for display. */
async function capture(windowId: number, rect: Rect, dpr: number): Promise<{ image: Image; thumb: Thumb; full: Thumb }> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const sx = Math.max(0, Math.round(rect.x * dpr)), sy = Math.max(0, Math.round(rect.y * dpr));
  const sw = Math.min(bitmap.width - sx, Math.round(rect.width * dpr)), sh = Math.min(bitmap.height - sy, Math.round(rect.height * dpr));
  if (sw < 2 || sh < 2) throw new Error('The selection is not visible on screen. Scroll it into view and try again.');
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const canvas = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  const t = Math.min(1, THUMB_EDGE / Math.max(sw, sh));
  const small = new OffscreenCanvas(Math.max(1, Math.round(sw * t)), Math.max(1, Math.round(sh * t)));
  const ctx = small.getContext('2d')!;
  ctx.fillStyle = '#ffffff'; // JPEG has no alpha
  ctx.fillRect(0, 0, small.width, small.height);
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, small.width, small.height);
  const thumbBlob = await small.convertToBlob({ type: 'image/jpeg', quality: 0.82 });
  // Full-resolution copy for the capture viewer (same pixels the model saw, as JPEG).
  const fullCtx = canvas.getContext('2d')!;
  fullCtx.globalCompositeOperation = 'destination-over';
  fullCtx.fillStyle = '#ffffff';
  fullCtx.fillRect(0, 0, canvas.width, canvas.height);
  const fullBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  return {
    image: { base64: toBase64(await blob.arrayBuffer()), mediaType: 'image/png' },
    full: { base64: toBase64(await fullBlob.arrayBuffer()), mediaType: 'image/jpeg', width: canvas.width, height: canvas.height },
    thumb: { base64: toBase64(await thumbBlob.arrayBuffer()), mediaType: 'image/jpeg', width: small.width, height: small.height },
  };
}

/** Open the Library tab, or focus the one already open; `id` selects a capture. */
const LIBRARY_TAB = 'pixelpeeper.libraryTab';
async function openLibrary(id?: string): Promise<void> {
  const url = chrome.runtime.getURL(`/library.html${id ? `#/idea/${encodeURIComponent(id)}` : ''}`);
  const known = (await chrome.storage.session.get(LIBRARY_TAB))[LIBRARY_TAB] as number | undefined;
  if (known !== undefined) {
    try {
      const tab = await chrome.tabs.update(known, { active: true, ...(id ? { url } : {}) });
      if (tab?.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
      return;
    } catch { /* the tab was closed */ }
  }
  const tab = await chrome.tabs.create({ url });
  await chrome.storage.session.set({ [LIBRARY_TAB]: tab.id });
}

/** Tell an open Library tab to refresh after the overlay changes the store. */
const notifyLibrary = () => chrome.runtime.sendMessage({ type: 'pp:library:changed' }).catch(() => {});

async function handle(msg: Msg, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'pp:status':
      return { hasKey: !!activeKey(await loadSettings()) };
    case 'pp:open-options':
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    case 'pp:capture':
      if (!sender.tab?.windowId) return { error: 'No tab to capture.', code: 'capture' };
      try { return await capture(sender.tab.windowId, msg.rect, msg.dpr); }
      catch (err) { return { error: err instanceof Error ? err.message : String(err), code: 'capture' }; }
    case 'pp:analyze': {
      const settings = await loadSettings();
      const key = activeKey(settings);
      if (!key) return { error: `Add your ${PROVIDERS[settings.provider].label} API key in Pixel Peeper settings.`, code: 'no-key' };
      const facts = Facts.parse(msg.facts);
      // Rules are recomputed here from the facts so the model sees exactly what the engine decided.
      const results = evaluate(facts, { scope: msg.scope });
      const analysis = await analyze({ provider: settings.provider, model: activeModel(settings), apiKey: key, facts, results, image: msg.image, scope: msg.scope, signal: AbortSignal.timeout(180_000) });
      return { analysis };
    }
    case 'pp:store:put': {
      const record = await store.put(CaptureRecord.parse(msg.record), msg.images);
      void notifyLibrary();
      return { record };
    }
    case 'pp:store:save': {
      const record = await store.save(msg.id, { title: msg.title, note: msg.note });
      void notifyLibrary();
      return { record };
    }
    case 'pp:store:get':
      return { record: await store.get(msg.id) };
    case 'pp:store:list':
      return { records: await store.list(msg.query) };
    case 'pp:store:delete':
      await store.delete(msg.id);
      void notifyLibrary();
      return { ok: true };
    case 'pp:open-library':
      await openLibrary(msg.id);
      return { ok: true };
    case 'pp:store:images':
      return { images: await store.images(msg.ids) };
  }
}

/**
 * One-time move of ideas saved by earlier versions (chrome.storage list + separate thumbnail keys)
 * into the library database. Old keys are removed only after every item is stored.
 */
const LEGACY_LIST = 'pixelpeeper.saved.v1';
async function migrateLegacySaves(): Promise<void> {
  if (await store.getMeta('migrated.saved.v1')) return;
  const data = await chrome.storage.local.get(LEGACY_LIST);
  const items = Array.isArray(data[LEGACY_LIST]) ? (data[LEGACY_LIST] as { id: string; scope?: string; facts: unknown; analysis?: unknown; shot?: string }[]) : [];
  const shotKeys = items.map((i) => i.shot).filter((k): k is string => !!k);
  const shots = shotKeys.length ? await chrome.storage.local.get(shotKeys) : {};
  for (const item of items) {
    const facts = Facts.safeParse(item.facts);
    if (!facts.success) continue;
    const url = new URL(facts.data.url);
    const siteName = siteNameFromHost(url.hostname);
    const page = { url: url.href, host: url.hostname, path: url.pathname, documentTitle: '', siteName, pageName: pageNameFrom('', siteName, url.pathname), favicon: null };
    const scope = item.scope === 'page' ? 'page' : 'element';
    const analysis = normalizeAnalysis(item.analysis);
    const pattern = patternName(facts.data, scope, analysis?.role?.title);
    const thumb = item.shot ? (shots[item.shot] as Thumb | undefined) ?? null : null;
    await store.put({
      id: `legacy:${item.id}`, createdAt: facts.data.capturedAt, updatedAt: facts.data.capturedAt, scope, page, facts: facts.data, analysis,
      pattern, title: captureTitle(pattern, page), titleSource: 'auto', saved: true, savedAt: facts.data.capturedAt, note: '', hasImage: !!thumb,
    }, thumb ? { thumb, full: null } : undefined);
  }
  await store.setMeta('migrated.saved.v1', true);
  await chrome.storage.local.remove([LEGACY_LIST, ...shotKeys]);
}

export default defineBackground(() => {
  void migrateLegacySaves().catch((err) => console.error('Pixel Peeper: migrating saved ideas failed', err));

  chrome.action.onClicked.addListener(async (tab) => {
    if (!tab.id) return;
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'pp:activate' });
      await chrome.action.setBadgeText({ tabId: tab.id, text: '' });
      await chrome.action.setTitle({ tabId: tab.id, title: 'Open Pixel Peeper' });
    } catch {
      await chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
      await chrome.action.setTitle({ tabId: tab.id, title: 'Reload a regular webpage to activate Pixel Peeper. Browser pages cannot be inspected.' });
    }
  });

  chrome.runtime.onMessage.addListener((msg: Msg, sender, sendResponse) => {
    if (!msg?.type?.startsWith('pp:') || msg.type === ('pp:activate' as string)) return false;
    handle(msg, sender).then(sendResponse, (err: unknown) =>
      sendResponse({
        error: err instanceof Error ? err.message : String(err),
        code: err instanceof AnalysisError ? err.code : undefined,
        retryAfter: err instanceof AnalysisError ? err.retryAfter : undefined,
      }),
    );
    return true; // async response
  });
});
