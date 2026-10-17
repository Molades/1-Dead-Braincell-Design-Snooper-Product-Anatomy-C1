import '../../components/fonts.css';
import '../../components/tokens.css';
import type { Quota } from '../../components/service';

/** Settings: today's allowance, what is sent, and setup. Lessons run on Pixel Peeper's service. */
const app = document.getElementById('app')!;

app.innerHTML = `
  <style>
    :root{color-scheme:light;font:15px/1.6 var(--sans);color:#1b1c1f;background:#f7f8f8}
    body{margin:0}main{max-width:560px;margin:48px auto;padding:0 16px}
    *{corner-shape:var(--sq)}::selection{background:rgb(94 106 210 / .2)}
    h1,h2{font-family:var(--display);letter-spacing:-.02em}
    h1{font:700 32px/1.2 var(--display);letter-spacing:-.025em;margin:0 0 8px}h2{font:700 17px var(--display);margin:28px 0 8px}
    p,li{color:#3c3f44}.muted{color:#6b6f76;font-size:13px}
    .allowance{background:#ffffff;border-radius:16px;padding:16px 18px;box-shadow:inset 0 0 0 1px var(--line),var(--hi),var(--lift-1)}
    .allowance strong{display:block;font:700 26px/1.1 var(--display);letter-spacing:-.02em;margin-bottom:4px}
    .bar{height:8px;border-radius:99px;background:var(--g-track,#eceef1);overflow:hidden;margin:10px 0 6px}.bar i{display:block;height:100%;background:var(--measured)}
    button{font:600 14px/1 var(--display);letter-spacing:-.01em;padding:11px 16px;border-radius:12px;border:0;cursor:pointer;color:#1b1c1f;background:var(--g-control);box-shadow:inset 0 0 0 1px var(--line),var(--hi),var(--lift-1);transition:transform .15s cubic-bezier(.23,1,.32,1),background-color .15s}
    button:active{transform:scale(.97)}button:focus-visible{outline:3px solid #5e6ad2;outline-offset:2px}
  </style>
  <h1>Pixel Peeper settings</h1>
  <h2>Today’s lessons</h2>
  <div class="allowance" id="allowance" aria-live="polite"><p class="muted">Checking…</p></div>
  <p class="muted">Lessons are included with Pixel Peeper. Measurements, rule checks, the viewer and the Library work without using any.</p>
  <h2>What is sent when you choose Get lesson</h2>
  <ul>
    <li>A screenshot of the selection you chose (only the visible part).</li>
    <li>The measured style values and rule results shown in the lesson window.</li>
    <li>Your level from setup, so the lesson is pitched right.</li>
  </ul>
  <p>They go to Pixel Peeper’s server, which asks an AI model (Groq) for the lesson and returns it. Screenshots are not stored on the server. Nothing is sent while you hover or pick, and the page address is not included. Your library stays in this browser.</p>
  <h2>Setup</h2>
  <p>Change your goals and level, or walk through the introduction again.</p>
  <button type="button" id="welcome">Run setup again</button>`;

const when = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

async function showAllowance() {
  const res = (await chrome.runtime.sendMessage({ type: 'pp:quota' }).catch(() => null)) as { quota?: Quota | null } | null;
  const q = res?.quota;
  const el = document.getElementById('allowance')!;
  el.innerHTML = q
    ? `<strong>${q.remaining} of ${q.limit} left</strong><div class="bar" role="img" aria-label="${q.used} of ${q.limit} used"><i style="width:${Math.min(100, (q.remaining / q.limit) * 100)}%"></i></div><p class="muted">Resets at ${when(q.resetAt)} (midnight UTC).</p>`
    : '<p class="muted">Couldn’t reach Pixel Peeper to check. Lessons will work again once you are online.</p>';
}

document.getElementById('welcome')!.addEventListener('click', () => { void chrome.runtime.sendMessage({ type: 'pp:open-welcome' }); });
void showAllowance();
