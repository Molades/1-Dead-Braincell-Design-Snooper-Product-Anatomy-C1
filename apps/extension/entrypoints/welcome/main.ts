import type { Goal, Level, Profile } from '@pixelpeeper/schema';
import { LESSONS_MODE } from '../../components/mode';
import type { Quota } from '../../components/service';
import { loadSettings, saveSettings, type Provider, type Settings } from '../../components/settings';
import { WELCOME_STEPS, poseUrl, headerView, stepView, type WelcomeState } from '../../components/welcome-view';
import { mountPixelLandscape } from '../../components/pixel-landscape';
import { createSound, type Cue } from '../../components/sound';
import { createMusic } from '../../components/music';
import { animateEyes } from '../../components/live-eyes';
import './welcome.css';

/** First-run setup. Every step is optional; answers are saved as you go. */

const app = document.getElementById('app')!;
let settings: Settings;
const state: WelcomeState = { step: 0, goals: ['learn'], level: 'practising', provider: 'groq', hasKey: {}, keyStatus: { kind: 'idle' }, dailyLimit: null, shortcut: null };
const LAST = WELCOME_STEPS.length - 1;

// ---------------------------------------------------------------------------------------------
// Sound and music. Nothing plays until the person presses or types something (browser policy); after
// that the score fades in unless they turned sound off before. One switch governs both.

const sound = createSound();
const music = createMusic(sound.audio);
/** Each step is a little livelier than the last. */
const INTENSITY = [0.28, 0.42, 0.5, 0.78];
const sfx = (cue: Cue) => sound.play(cue, true);

function syncSoundToggle() {
  const b = app.querySelector<HTMLButtonElement>('.sound-toggle');
  if (!b) return;
  const on = music.isPlaying();
  b.setAttribute('aria-pressed', String(on));
  b.classList.toggle('playing', on);
  b.querySelector('.lbl')!.textContent = on ? 'Sound on' : 'Sound off';
  b.title = on ? 'Music and sound are on. Click to turn off.' : 'Turn on music and sound';
}

function unlock() {
  sound.gesture();
  if (!sound.isMuted() && !music.isPlaying() && music.start()) { music.setIntensity(INTENSITY[state.step] ?? 0.3); syncSoundToggle(); }
}
addEventListener('pointerdown', unlock, { capture: true });
addEventListener('keydown', unlock, { capture: true });

function toggleSound() {
  if (music.isPlaying()) { sfx('tick'); music.stop(); sound.setMuted(true); }
  else { sound.setMuted(false); sound.gesture(); music.start(); music.setIntensity(INTENSITY[state.step] ?? 0.3); sfx('blip'); }
  syncSoundToggle();
}

const ask = <T,>(msg: object) => chrome.runtime.sendMessage(msg) as Promise<T>;
const saveProfile = (patch: Partial<Profile>) => ask({ type: 'pp:profile:set', patch });

// ---------------------------------------------------------------------------------------------
// Motion vocabulary (Emil Kowalski's rules): ease-out for anything entering or leaving, ease-in-out for
// movement on screen, never ease-in; exits are quicker than entrances; nothing starts from scale(0).

const EASE_OUT = 'cubic-bezier(.23, 1, .32, 1)';
const EASE_IN_OUT = 'cubic-bezier(.77, 0, .175, 1)';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
/** A damped spring (about 8% overshoot), for the few things that should feel physical. */
const SPRING = 'linear(0, 0.026, 0.092, 0.186, 0.295, 0.411, 0.525, 0.634, 0.733, 0.819, 0.893, 0.952, 0.999, 1.034, 1.059, 1.074, 1.082, 1.083, 1.081, 1.075, 1.067, 1.058, 1.048, 1.038, 1.029, 1.021, 1.014, 1.008, 1.003, 1, 0.997, 0.995, 0.994, 0.993, 0.993, 0.993, 0.994, 0.995, 0.995, 0.996, 1)';

/** Each step change bumps the run id; any sequence still running from an older step stops. */
let run = 0;
const wait = (ms: number, id: number) =>
  new Promise<boolean>((resolve) => setTimeout(() => resolve(id === run), ms));
const done = (a: Animation) => a.finished.then(() => true, () => false);

// ---------------------------------------------------------------------------------------------
// Rendering. The header and progress render once; the step body is swapped.

let stepEl: HTMLElement;

function renderShell() {
  app.innerHTML = `${headerView(state)}<section class="step" data-step="${state.step}"></section>`;
  stepEl = app.querySelector('.step')!;
}

function syncChrome() {
  app.querySelectorAll('.progress li').forEach((li, i) => {
    li.classList.toggle('done', i < state.step);
    li.classList.toggle('now', i === state.step);
    if (i === state.step) li.setAttribute('aria-current', 'step');
    else li.removeAttribute('aria-current');
  });
  const skip = app.querySelector<HTMLElement>('.skip');
  if (skip) skip.hidden = state.step === LAST;
  document.body.dataset.step = String(state.step);
}

/** Re-render the current step in place (key status, provider switch), keeping a typed key. No entrance motion. */
function patch() {
  const typed = (document.getElementById('key') as HTMLInputElement | null)?.value ?? '';
  stepEl.innerHTML = stepView(state);
  const key = document.getElementById('key') as HTMLInputElement | null;
  if (key && typed && state.keyStatus.kind !== 'ok') key.value = typed;
  afterRender(false);
}

/** Move between steps: the old body leaves in the direction of travel, the new one arrives staggered. */
async function show(next: number) {
  const dir = next >= state.step ? 1 : -1;
  const id = ++run;
  const first = !stepEl.childElementCount;

  if (!first && !reduced.matches) {
    stepEl.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    const leave = stepEl.animate(
      [{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateX(${-dir * 12}px)`, filter: 'blur(3px)' }],
      { duration: 140, easing: EASE_OUT, fill: 'forwards' },
    );
    await done(leave);
    if (id !== run) return;
  }

  state.step = next;
  stepEl.dataset.step = String(next);
  if (!first) sfx('swish');
  music.setIntensity(INTENSITY[next] ?? 0.3);
  stepEl.innerHTML = stepView(state);
  stepEl.getAnimations().forEach((a) => a.cancel());
  syncChrome();
  scrollTo({ top: 0, behavior: reduced.matches || first ? 'auto' : 'smooth' });
  stepEl.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });

  if (reduced.matches) {
    if (!first) stepEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  } else {
    // A list-like arrival: each block rises out of a slight blur, 45ms apart, capped.
    stepEl.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el, i) => {
      el.animate(
        [{ opacity: 0, transform: `translate(${dir * 14}px, 8px)`, filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 560, delay: (first ? 120 : 40) + Math.min(i, 6) * 45, easing: EASE_OUT, fill: 'backwards' },
      );
    });
  }
  afterRender(true);
}

function afterRender(entering: boolean) {
  popMascots(entering);
  if (state.step === 0) { measureDemo(); if (entering) void playPick(run); }
  if (state.step === LAST && entering) void playPin(run);
}

/** The step's detective springs in. Re-renders of the same step leave it alone. */
function popMascots(entering: boolean) {
  if (!entering || reduced.matches) return;
  if (stepEl.querySelector('.speaker')) setTimeout(() => sfx('pop'), 260);
  stepEl.querySelectorAll<HTMLElement>('.speaker').forEach((m) =>
    m.animate(
      [{ opacity: 0, transform: 'translateY(10px) scale(.92) rotate(-4deg)' }, { opacity: 1, transform: 'none' }],
      { duration: 720, delay: 140, easing: SPRING, fill: 'backwards' },
    ),
  );
  // On the first step the detective peeks up from behind the browser frame.
  stepEl.querySelectorAll<HTMLElement>('.peeker').forEach((m) =>
    m.animate(
      [{ transform: 'translateY(70%)' }, { transform: 'none' }],
      { duration: 820, delay: 520, easing: SPRING, fill: 'backwards' },
    ),
  );
}

// ---------------------------------------------------------------------------------------------
// Step 1: the product demonstrating itself. A cursor picks the button, the scan beam passes,
// and the lesson arrives. Afterwards the card is live: hovering measures real elements.

const q = <T extends Element = HTMLElement>(sel: string) => stepEl.querySelector<T>(sel);

function luminance(rgb: string) {
  const [r, g, b] = (rgb.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Fill the sample lesson's Measured values from the rendered button, so the demo never invents them. */
function measureDemo() {
  const cta = q('.plan-cta');
  if (!cta) return;
  const cs = getComputedStyle(cta);
  const [a, b] = [luminance(cs.color), luminance(cs.backgroundColor)].sort((x, y) => y - x);
  const ratio = (a! + 0.05) / (b! + 0.05);
  const rect = cta.getBoundingClientRect();
  const set = (k: string, v: string) => { const el = q(`[data-measure="${k}"]`); if (el) el.textContent = v; };
  set('contrast', `${ratio.toFixed(1)}:1`);
  set('size', `${Math.round(rect.width)}×${Math.round(rect.height)}px`);
}

function outlineTo(target: HTMLElement | null, label?: string) {
  const outline = q('.pick-outline');
  const browser = q('.browser');
  if (!outline || !browser) return;
  if (!target) { outline.classList.remove('on'); return; }
  const b = browser.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  // Unitless numbers: the outline is drawn with transforms only (see welcome.css).
  outline.style.setProperty('--x', String(r.left - b.left - 3));
  outline.style.setProperty('--y', String(r.top - b.top - 3));
  outline.style.setProperty('--w', String(r.width + 6));
  outline.style.setProperty('--h', String(r.height + 6));
  outline.querySelector('.pick-tag')!.textContent = `${label ?? target.dataset.pick} · ${Math.round(r.width)}×${Math.round(r.height)}`;
  outline.classList.add('on');
}

function pointAt(cursor: HTMLElement, target: HTMLElement, dx = 0.5, dy = 0.55) {
  const b = q('.browser')!.getBoundingClientRect();
  const r = target.getBoundingClientRect();
  return `translate(${r.left - b.left + r.width * dx}px, ${r.top - b.top + r.height * dy}px)`;
}

async function playPick(id: number) {
  const demo = q('.demo');
  const cursor = q('.cursor');
  const card = q('.plan');
  const cta = q('.plan-cta');
  const beam = q('.beam');
  const lesson = q('.lesson-card');
  if (!demo || !cursor || !card || !cta || !beam || !lesson) return;
  demo.classList.remove('live', 'picked');
  lesson.classList.remove('in');
  outlineTo(null);

  if (reduced.matches) {
    outlineTo(cta);
    demo.classList.add('picked', 'live');
    lesson.classList.add('in');
    return;
  }

  if (!(await wait(900, id))) return;
  const start = `translate(${q('.browser')!.clientWidth * 0.12}px, ${q('.browser')!.clientHeight * 0.92}px)`;
  cursor.animate([{ opacity: 0, transform: `${start} scale(.9)` }, { opacity: 1, transform: start }], { duration: 220, easing: EASE_OUT, fill: 'forwards' });
  if (!(await wait(220, id))) return;

  // Hover the card first, the way a real pick widens and narrows.
  const toCard = cursor.animate([{ transform: start }, { transform: pointAt(cursor, card, 0.7, 0.3) }], { duration: 760, easing: EASE_IN_OUT, fill: 'forwards' });
  if (!(await wait(420, id))) return;
  outlineTo(card);
  sfx('tick');
  if (!(await done(toCard)) || !(await wait(260, id))) return;
  const toCta = cursor.animate([{ transform: pointAt(cursor, card, 0.7, 0.3) }, { transform: pointAt(cursor, cta) }], { duration: 620, easing: EASE_IN_OUT, fill: 'forwards' });
  if (!(await wait(380, id))) return;
  outlineTo(cta);
  sfx('tick');
  if (!(await done(toCta)) || !(await wait(180, id))) return;

  // Click: the cursor presses, the outline commits.
  cursor.animate([{ transform: pointAt(cursor, cta) }, { transform: `${pointAt(cursor, cta)} scale(.86)` }, { transform: pointAt(cursor, cta) }], { duration: 220, easing: EASE_OUT });
  demo.classList.add('picked');
  sfx('lock');
  if (!(await wait(240, id))) return;

  // Scan: one beam pass over the selection (the overlay's own signature).
  const b = q('.browser')!.getBoundingClientRect();
  const r = cta.getBoundingClientRect();
  beam.style.left = `${r.left - b.left}px`;
  beam.style.width = `${r.width}px`;
  const top = r.top - b.top;
  const scan = beam.animate(
    [{ opacity: 0, transform: `translateY(${top}px)` }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.88 }, { opacity: 0, transform: `translateY(${top + r.height}px)` }],
    { duration: 900, easing: EASE_IN_OUT },
  );
  cursor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, delay: 200, easing: EASE_OUT, fill: 'forwards' });
  sfx('shimmer');
  if (!(await done(scan)) || id !== run) return;

  lesson.classList.add('in');
  sfx('ding');
  if (!(await wait(700, id))) return;
  demo.classList.add('live');
}

let lastDemoTarget: HTMLElement | null = null;
function onDemoHover(e: PointerEvent) {
  const demo = q('.demo');
  if (state.step !== 0 || !demo?.classList.contains('live')) return;
  const target = (e.target as Element).closest<HTMLElement>('[data-pick]');
  if (target && demo.contains(target) && target !== lastDemoTarget) { lastDemoTarget = target; outlineTo(target); sfx('tick'); }
}

/** The detective on the first step ducks behind the browser frame now and then, and pops back up. */
function peekaboo() {
  const loop = () => setTimeout(async () => {
    const p = stepEl?.querySelector<HTMLElement>('.peeker');
    if (p && !reduced.matches && !document.hidden) {
      await done(p.animate([{ transform: 'none' }, { transform: 'translateY(78%)' }], { duration: 380, easing: EASE_IN_OUT, fill: 'forwards' }));
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 900));
      p.animate([{ transform: 'translateY(78%)' }, { transform: 'none' }], { duration: 720, easing: SPRING, fill: 'forwards' }).finished.then(() => p.getAnimations().forEach((a) => a.cancel()), () => {});
    }
    loop();
  }, 8000 + Math.random() * 7000);
  loop();
}

// ---------------------------------------------------------------------------------------------
// Last step: a small Chrome toolbar shows where the pin is. Loops quietly while visible.

async function playPin(id: number) {
  const tb = q('.tb');
  const cursor = q('.toolbar-demo .cursor');
  const puzzle = q('.tb-puzzle');
  const pin = q('.tb-pin');
  if (!tb || !cursor || !puzzle || !pin) return;

  if (reduced.matches) { tb.classList.add('pinned'); return; }

  const pos = (el: Element, dx = 0.5, dy = 0.6) => {
    const b = tb.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return `translate(${r.left - b.left + r.width * dx}px, ${r.top - b.top + r.height * dy}px)`;
  };
  while (id === run) {
    tb.classList.remove('menu', 'pinned', 'pressing');
    const rest = `translate(${tb.clientWidth * 0.35}px, ${tb.clientHeight + 40}px)`;
    cursor.animate([{ opacity: 0, transform: rest }, { opacity: 1, transform: rest }], { duration: 200, fill: 'forwards' });
    if (!(await wait(900, id))) return;
    await done(cursor.animate([{ transform: rest }, { transform: pos(puzzle) }], { duration: 700, easing: EASE_IN_OUT, fill: 'forwards' }));
    if (id !== run) return;
    tb.classList.add('menu');
    sfx('tick');
    if (!(await wait(520, id))) return;
    await done(cursor.animate([{ transform: pos(puzzle) }, { transform: pos(pin) }], { duration: 560, easing: EASE_IN_OUT, fill: 'forwards' }));
    if (id !== run) return;
    tb.classList.add('pressing');
    if (!(await wait(160, id))) return;
    tb.classList.remove('pressing');
    tb.classList.add('pinned');
    sfx('blip');
    if (!(await wait(560, id))) return;
    tb.classList.remove('menu');
    cursor.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' });
    if (!(await wait(3200, id))) return;
    // Pause while the tab is hidden: a nonessential loop should not run unseen.
    while (document.hidden && id === run) if (!(await wait(500, id))) return;
  }
}

// ---------------------------------------------------------------------------------------------
// Finish: the detective makes its getaway with a small burst of pixels, then the tab closes.

async function finish(button: HTMLElement) {
  sfx('success');
  music.stop(1.6);
  await saveProfile({ onboarded: true });
  if (!reduced.matches) {
    const r = button.getBoundingClientRect();
    const colors = ['#f5c84c', '#5e6ad2', '#22a05a', '#d38a3a', '#1b1c1f'];
    for (let i = 0; i < 18; i++) {
      const px = document.createElement('i');
      px.className = 'pixel';
      px.style.background = colors[i % colors.length]!;
      px.style.left = `${r.left + r.width / 2}px`;
      px.style.top = `${r.top + r.height / 2}px`;
      document.body.appendChild(px);
      const angle = (i / 18) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 70 + Math.random() * 70;
      px.animate(
        [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist - 30}px)) scale(.4) rotate(${Math.random() * 180}deg)`, opacity: 0 }],
        { duration: 700 + Math.random() * 200, easing: EASE_OUT, fill: 'forwards' },
      ).finished.then(() => px.remove(), () => px.remove());
    }
    const hero = stepEl.querySelector<HTMLImageElement>('.speaker');
    if (hero) {
      hero.src = poseUrl('getaway');
      await done(hero.animate([{ transform: 'none' }, { transform: 'translateX(-6px)', offset: 0.25 }, { transform: 'translateX(70vw)', opacity: 0 }], { duration: 700, easing: EASE_IN_OUT, fill: 'forwards' }));
    }
  }
  try {
    const tab = await chrome.tabs.getCurrent();
    if (tab?.id != null) { await chrome.tabs.remove(tab.id); return; }
  } catch { /* fall through */ }
  window.close();
}

// ---------------------------------------------------------------------------------------------
// Actions

async function go(where: string, el: HTMLElement) {
  if (where === 'back') return show(Math.max(0, state.step - 1));
  if (where === 'next') {
    const next = Math.min(LAST, state.step + 1);
    if (next === LAST) void saveProfile({ onboarded: true });
    return show(next);
  }
  if (where === 'skip') { void saveProfile({ onboarded: true }); return show(LAST); }
  if (where === 'library') { await ask({ type: 'pp:open-library' }); return; }
  if (where === 'done') return finish(el);
  if (where === 'sound') return toggleSound();
}

/** Own-key mode: test the key for free (lists models), then save it. */
async function testKey() {
  const input = document.getElementById('key') as HTMLInputElement;
  const key = input.value.trim() || settings.keys[state.provider] || '';
  if (!key) { state.keyStatus = { kind: 'error', message: 'Paste a key first.' }; patch(); shake(); return; }
  state.keyStatus = { kind: 'testing' };
  patch();
  const res = await ask<{ error: string | null }>({ type: 'pp:test-key', provider: state.provider, key });
  if (state.step !== 2) return;
  if (res.error) { state.keyStatus = { kind: 'error', message: res.error }; patch(); shake(); sfx('bonk'); return; }
  settings = { ...settings, provider: state.provider, keys: { ...settings.keys, [state.provider]: key } };
  await saveSettings(settings);
  state.hasKey = { ...state.hasKey, [state.provider]: true };
  state.keyStatus = { kind: 'ok', message: 'Key works and is saved. Lessons are on.' };
  patch();
  sfx('chime');
}

/** One short horizontal shake on the key field: the error is about that field. */
function shake() {
  const field = q('.field');
  if (!field || reduced.matches) return;
  field.animate(
    [{ transform: 'none' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(2px)' }, { transform: 'none' }],
    { duration: 380, easing: EASE_OUT },
  );
  (document.getElementById('key') as HTMLInputElement | null)?.focus();
}

app.addEventListener('click', (e) => {
  const t = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!t || t.disabled) return;
  if (t.dataset.go) void go(t.dataset.go, t);
  if (t.dataset.key === 'test') void testKey();
  if (t.dataset.demo === 'replay') void playPick(++run);
});

app.addEventListener('pointerover', onDemoHover);

app.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  sfx(input.checked || input.type === 'radio' ? 'select' : 'tick');
  if (input.name === 'goal') {
    state.goals = [...app.querySelectorAll<HTMLInputElement>('input[name=goal]:checked')].map((i) => i.value as Goal);
    void saveProfile({ goals: state.goals });
  } else if (input.name === 'level') {
    state.level = input.value as Level;
    void saveProfile({ level: state.level });
  } else if (input.name === 'provider') {
    state.provider = input.value as Provider;
    state.keyStatus = { kind: 'idle' };
    patch();
    app.querySelector<HTMLInputElement>(`input[name=provider][value=${state.provider}]`)?.focus();
  }
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target as HTMLElement).id === 'key') { e.preventDefault(); void testKey(); }
});


void (async () => {
  const { profile } = await ask<{ profile: Profile }>({ type: 'pp:profile:get' });
  state.goals = profile.goals;
  state.level = profile.level;
  settings = await loadSettings();
  state.provider = settings.provider;
  state.hasKey = { groq: !!settings.keys.groq, anthropic: !!settings.keys.anthropic };
  if (LESSONS_MODE === 'hosted') {
    // Registers this install with the service and reads the allowance (works offline too: just unknown).
    const quota = (await ask<{ quota?: Quota | null }>({ type: 'pp:quota' }).catch(() => null))?.quota;
    state.dailyLimit = quota?.limit ?? null;
  }
  const commands = await chrome.commands.getAll();
  state.shortcut = commands.find((c) => c.name === 'pick')?.shortcut || null;
  renderShell();
  mountPixelLandscape();
  animateEyes(app);
  peekaboo();
  void show(0);
  syncSoundToggle();
})();
