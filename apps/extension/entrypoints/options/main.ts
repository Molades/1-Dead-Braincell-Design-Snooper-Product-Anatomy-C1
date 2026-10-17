import { DEFAULT_MODELS } from '@pixelpeeper/analysis';
import '../../components/fonts.css';
import '../../components/tokens.css';
import { loadSettings, PROVIDERS, saveSettings, type Provider, type Settings } from '../../components/settings';

const app = document.getElementById('app')!;
const ids = Object.keys(PROVIDERS) as Provider[];

app.innerHTML = `
  <style>
    :root{color-scheme:light;font:15px/1.6 var(--sans);color:#1b1c1f;background:#f7f8f8}
    body{margin:0}main{max-width:560px;margin:48px auto;padding:0 16px}
    h1{font:600 32px/1.2 var(--sans);margin:0 0 8px}h2{font:500 15px var(--sans);margin:28px 0 8px}
    *{corner-shape:var(--sq)}::selection{background:rgb(94 106 210 / .2)}
    h1,h2{font-family:var(--display);letter-spacing:-.02em}h1{font-weight:700}h2{font-weight:700;font-size:17px}
    p,li{color:#3c3f44}.muted{color:#6b6f76;font-size:13px}
    label{display:block;font-weight:500;margin:14px 0 6px}
    input[type=password],input[type=text]{width:100%;box-sizing:border-box;font:inherit;padding:10px 12px;border:0;border-radius:12px;background:#ffffff;box-shadow:inset 0 0 0 1px var(--line),inset 0 1px 2px rgb(15 16 18 / .05)}
    input:focus-visible,button:focus-visible{outline:3px solid #5e6ad2;outline-offset:2px}
    fieldset{border:0;padding:0;margin:0;display:flex;gap:8px}
    fieldset label{margin:0;font-weight:400;display:flex;gap:6px;align-items:center;padding:8px 14px;border:1px solid #d5d7dc;border-radius:99px;background:#ffffff;cursor:pointer}
    fieldset label:has(input:checked){border-color:#5e6ad2;box-shadow:0 0 0 1px #5e6ad2,0 4px 12px -6px rgb(94 106 210 / .5);background:linear-gradient(#f8f9ff,#eef0fc);font-weight:500}
    .row{display:flex;gap:8px;margin-top:14px}
    button{font:600 14px/1 var(--display);letter-spacing:-.01em;padding:11px 16px;border-radius:12px;border:0;cursor:pointer;color:#1b1c1f;background:var(--g-control);box-shadow:inset 0 0 0 1px var(--line),var(--hi),var(--lift-1)}
    button.primary{color:#fff;background:var(--g-primary);box-shadow:inset 0 0 0 1px #4a55bd,var(--hi-strong),var(--glow-primary)}button.primary:hover{background:var(--g-primary-hover)}button{transition:transform .15s cubic-bezier(.23,1,.32,1),background-color .15s}button:active{transform:scale(.97)}h1{letter-spacing:-.025em}#status{min-height:1.6em;margin-top:10px;font-size:13px}
  </style>
  <h1>Pixel Peeper settings</h1>
  <p>Pixel Peeper measures styles on your device. AI design lessons use your own API key.</p>
  <form id="form">
    <h2>AI provider</h2>
    <fieldset>${ids.map((id) => `<label><input type="radio" name="provider" value="${id}"> ${PROVIDERS[id].label}</label>`).join('')}</fieldset>
    <label for="key" id="key-label">API key</label>
    <input id="key" type="password" autocomplete="off" spellcheck="false" />
    <label for="model">Model</label>
    <input id="model" type="text" autocomplete="off" spellcheck="false" />
    <p class="muted" id="model-hint"></p>
    <div class="row"><button class="primary" type="submit">Save</button><button type="button" id="remove">Remove key</button></div>
    <p id="status" role="status"></p>
  </form>
  <h2>Setup</h2>
  <p>Change your goals and level, or walk through the introduction again.</p>
  <div class="row"><button type="button" id="welcome">Run setup again</button></div>
  <h2>What is sent when you analyze</h2>
  <ul>
    <li>A screenshot of the selection you chose (only the visible part).</li>
    <li>The measured style values and rule results shown in the lesson window.</li>
  </ul>
  <p>Nothing is sent while you hover or select. The page URL is not included. Keys are stored in this browser profile's extension storage and sent only to the selected provider (<span id="host"></span>). Usage is billed to your account with that provider.</p>`;

const form = document.getElementById('form') as HTMLFormElement;
const keyInput = document.getElementById('key') as HTMLInputElement;
const modelInput = document.getElementById('model') as HTMLInputElement;
const statusEl = document.getElementById('status')!;
let settings: Settings;

const current = () => (new FormData(form).get('provider') as Provider) ?? settings.provider;

function render() {
  const p = current(), info = PROVIDERS[p], saved = settings.keys[p];
  document.getElementById('key-label')!.textContent = `${info.label} API key`;
  keyInput.placeholder = saved ? `Saved, ending in …${saved.slice(-4)}. Paste a new key to replace it.` : `${info.keyPrefix}…`;
  keyInput.value = '';
  modelInput.value = settings.models[p] ?? '';
  modelInput.placeholder = DEFAULT_MODELS[p];
  document.getElementById('model-hint')!.textContent = `Leave blank for the default (${DEFAULT_MODELS[p]}). The model must accept images. Create keys at ${info.console}.`;
  document.getElementById('host')!.textContent = info.host;
  statusEl.textContent = saved ? `${info.label} key saved.${settings.provider === p ? ' This provider is active.' : ''}` : `No ${info.label} key saved. Measurements and rule checks still work without one.`;
}

form.addEventListener('change', (e) => { if ((e.target as HTMLInputElement).name === 'provider') render(); });
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = current(), key = keyInput.value.trim();
  if (!key && !settings.keys[p]) { statusEl.textContent = 'Paste a key first.'; return; }
  settings = { provider: p, keys: { ...settings.keys, ...(key ? { [p]: key } : {}) }, models: { ...settings.models, [p]: modelInput.value.trim() || undefined } };
  await saveSettings(settings);
  render();
  statusEl.textContent = `Saved. ${PROVIDERS[p].label} is now the active provider.`;
  if (key && !key.startsWith(PROVIDERS[p].keyPrefix)) statusEl.textContent += ` This does not look like a ${PROVIDERS[p].label} key; check it if analysis fails.`;
});
document.getElementById('remove')!.addEventListener('click', async () => {
  const p = current(), keys = { ...settings.keys };
  delete keys[p];
  settings = { ...settings, keys };
  await saveSettings(settings);
  render();
});

document.getElementById('welcome')!.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: 'pp:open-welcome' }); });

void loadSettings().then((s) => {
  settings = s;
  (form.querySelector(`input[value="${s.provider}"]`) as HTMLInputElement).checked = true;
  render();
});
