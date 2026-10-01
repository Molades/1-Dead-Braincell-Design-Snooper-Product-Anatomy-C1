import { createOverlay } from '../components/overlay';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    const ui = createOverlay();
    const listener = (msg: { type: string }) => {
      if (msg.type === 'pp:activate') ui.activate();
      if (msg.type === 'pp:start-pick') ui.pick();
      if (msg.type === 'pp:stop-pick') ui.deactivate();
    };
    chrome.runtime.onMessage.addListener(listener);
    ctx.onInvalidated(() => { chrome.runtime.onMessage.removeListener(listener); ui.destroy(); });
  },
});
