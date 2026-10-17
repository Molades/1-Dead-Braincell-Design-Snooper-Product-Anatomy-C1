import type { Quota } from '../../components/service';

/** Settings: today's allowance, what is sent, and setup. Lessons run on Pixel Peeper's service. */
const app = document.getElementById('app')!;

app.innerHTML = `
  <style>
    :root{color-scheme:light;font:15px/1.6 system-ui;color:#252523;background:#f8f7f2}
    body{margin:0}main{max-width:560px;margin:48px auto;padding:0 16px}
    h1{font:400 32px/1.2 Georgia,serif;margin:0 0 8px}h2{font:500 15px system-ui;margin:28px 0 8px}
    p,li{color:#4a4a45}.muted{color:#62625d;font-size:13px}
    .allowance{background:#fffefa;border:1px solid #deded5;border-radius:14px;padding:16px 18px}
    .allowance strong{font:400 28px/1.1 Georgia,serif;display:block;margin-bottom:4px}
    .bar{height:8px;border-radius:99px;background:#eeede6;overflow:hidden;margin:10px 0 6px}.bar i{display:block;height:100%;background:#216659}
    button{font:inherit;padding:9px 16px;border-radius:9px;border:0;cursor:pointer;background:#eeede5}
    button:focus-visible{outline:3px solid #345be4;outline-offset:2px}
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
