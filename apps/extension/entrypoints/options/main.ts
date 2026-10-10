const KEY = 'pixelpeeper.apiKey';
const app = document.getElementById('app')!;

app.innerHTML = `
  <style>
    :root{color-scheme:light;font:15px/1.6 system-ui;color:#252523;background:#f8f7f2}
    body{margin:0}main{max-width:560px;margin:48px auto;padding:0 16px}
    h1{font:400 32px/1.2 Georgia,serif;margin:0 0 8px}h2{font:500 15px system-ui;margin:28px 0 8px}
    p,li{color:#4a4a45}.muted{color:#62625d;font-size:13px}
    label{display:block;font-weight:500;margin-bottom:6px}
    input{width:100%;box-sizing:border-box;font:inherit;padding:10px 12px;border:1px solid #cfcfc5;border-radius:9px;background:#fffefa}
    input:focus-visible,button:focus-visible{outline:3px solid #345be4;outline-offset:2px}
    .row{display:flex;gap:8px;margin-top:12px}
    button{font:inherit;padding:9px 16px;border-radius:9px;border:0;cursor:pointer;background:#eeede5}
    button.primary{background:#f9d54a}#status{min-height:1.6em;margin-top:10px;font-size:13px}
  </style>
  <h1>Pixel Peeper settings</h1>
  <p>Pixel Peeper measures styles on your device. AI design lessons use your own Anthropic API key.</p>
  <h2>Anthropic API key</h2>
  <form id="form">
    <label for="key">API key</label>
    <input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" />
    <div class="row"><button class="primary" type="submit">Save key</button><button type="button" id="remove">Remove key</button></div>
    <p id="status" role="status"></p>
  </form>
  <p class="muted">Create a key in the Anthropic Console. Usage is billed to your account.</p>
  <h2>What is sent when you analyze</h2>
  <ul>
    <li>A screenshot of the selection you chose (only the visible part).</li>
    <li>The measured style values and rule results shown in the lesson window.</li>
  </ul>
  <p>Nothing is sent while you hover or select. The page URL is not included in the request. The key is stored in this browser profile's extension storage and sent only to api.anthropic.com.</p>`;

const input = document.getElementById('key') as HTMLInputElement;
const statusEl = document.getElementById('status')!;

async function refresh() {
  const stored = (await chrome.storage.local.get(KEY))[KEY];
  statusEl.textContent = typeof stored === 'string' && stored ? `Key saved, ending in …${stored.slice(-4)}.` : 'No key saved. Measurements and rule checks still work without one.';
}

document.getElementById('form')!.addEventListener('submit', async (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (!value) { statusEl.textContent = 'Paste a key first.'; return; }
  await chrome.storage.local.set({ [KEY]: value });
  input.value = '';
  await refresh();
  if (!value.startsWith('sk-ant-')) statusEl.textContent += ' This does not look like an Anthropic key; check it if analysis fails.';
});
document.getElementById('remove')!.addEventListener('click', async () => {
  await chrome.storage.local.remove(KEY);
  await refresh();
});
void refresh();
