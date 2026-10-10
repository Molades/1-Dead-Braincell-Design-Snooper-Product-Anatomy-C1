import { analyze, AnalysisError } from '@pixelpeeper/analysis';
import { evaluate } from '@pixelpeeper/rules';
import { Facts } from '@pixelpeeper/schema';
import { activeKey, activeModel, loadSettings, PROVIDERS } from '../components/settings';
/** Long edge cap for the screenshot; larger images are downscaled before upload. */
const MAX_EDGE = 1568;

type Rect = { x: number; y: number; width: number; height: number };
type Image = { base64: string; mediaType: 'image/png' };
type Msg =
  | { type: 'pp:status' }
  | { type: 'pp:open-options' }
  | { type: 'pp:capture'; rect: Rect; dpr: number }
  | { type: 'pp:analyze'; facts: unknown; scope: 'element' | 'page'; image: Image };


function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Capture the visible tab and crop to the selection's visible bounds. */
async function capture(windowId: number, rect: Rect, dpr: number): Promise<Image> {
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const sx = Math.max(0, Math.round(rect.x * dpr)), sy = Math.max(0, Math.round(rect.y * dpr));
  const sw = Math.min(bitmap.width - sx, Math.round(rect.width * dpr)), sh = Math.min(bitmap.height - sy, Math.round(rect.height * dpr));
  if (sw < 2 || sh < 2) throw new Error('The selection is not visible on screen. Scroll it into view and try again.');
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const canvas = new OffscreenCanvas(Math.round(sw * scale), Math.round(sh * scale));
  canvas.getContext('2d')!.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { base64: toBase64(await blob.arrayBuffer()), mediaType: 'image/png' };
}

async function handle(msg: Msg, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (msg.type) {
    case 'pp:status':
      return { hasKey: !!activeKey(await loadSettings()) };
    case 'pp:open-options':
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    case 'pp:capture':
      if (!sender.tab?.windowId) return { error: 'No tab to capture.' };
      return { image: await capture(sender.tab.windowId, msg.rect, msg.dpr) };
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
  }
}

export default defineBackground(() => {
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
      sendResponse({ error: err instanceof Error ? err.message : String(err), code: err instanceof AnalysisError ? err.code : undefined }),
    );
    return true; // async response
  });
});
