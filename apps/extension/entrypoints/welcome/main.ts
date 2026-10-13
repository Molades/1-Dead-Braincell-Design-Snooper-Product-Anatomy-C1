import type { Goal, Level, Profile } from '@pixelpeeper/schema';
import { loadSettings, saveSettings, type Provider, type Settings } from '../../components/settings';
import { WELCOME_STEPS, welcomeView, type WelcomeState } from '../../components/welcome-view';
import './welcome.css';

/** First-run setup. Every step is optional; answers are saved as you go. */

const app = document.getElementById('app')!;
let settings: Settings;
const state: WelcomeState = { step: 0, goals: ['learn'], level: 'practising', provider: 'groq', hasKey: {}, keyStatus: { kind: 'idle' }, shortcut: null };

const ask = <T,>(msg: object) => chrome.runtime.sendMessage(msg) as Promise<T>;
const saveProfile = (patch: Partial<Profile>) => ask({ type: 'pp:profile:set', patch });

function render() {
  app.innerHTML = welcomeView(state);
  app.querySelector<HTMLElement>('h1')?.focus();
}

async function go(where: string) {
  if (where === 'back') state.step = Math.max(0, state.step - 1);
  else if (where === 'next') state.step = Math.min(WELCOME_STEPS.length - 1, state.step + 1);
  else if (where === 'skip') state.step = WELCOME_STEPS.length - 1;
  else if (where === 'library') { await ask({ type: 'pp:open-library' }); return; }
  else if (where === 'done') { await saveProfile({ onboarded: true }); window.close(); return; }
  if (state.step === WELCOME_STEPS.length - 1) void saveProfile({ onboarded: true });
  render();
}

async function testKey() {
  const input = document.getElementById('key') as HTMLInputElement;
  const key = input.value.trim() || settings.keys[state.provider] || '';
  if (!key) { state.keyStatus = { kind: 'error', message: 'Paste a key first.' }; render(); return; }
  state.keyStatus = { kind: 'testing' };
  render();
  const res = await ask<{ error: string | null }>({ type: 'pp:test-key', provider: state.provider, key });
  if (res.error) { state.keyStatus = { kind: 'error', message: res.error }; render(); return; }
  settings = { ...settings, provider: state.provider, keys: { ...settings.keys, [state.provider]: key } };
  await saveSettings(settings);
  state.hasKey = { ...state.hasKey, [state.provider]: true };
  state.keyStatus = { kind: 'ok', message: 'Key works and is saved. Lessons are on.' };
  render();
}

app.addEventListener('click', (e) => {
  const t = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!t) return;
  if (t.dataset.go) void go(t.dataset.go);
  if (t.dataset.key === 'test') void testKey();
});

app.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.name === 'goal') {
    state.goals = [...app.querySelectorAll<HTMLInputElement>('input[name=goal]:checked')].map((i) => i.value as Goal);
    void saveProfile({ goals: state.goals });
  } else if (input.name === 'level') {
    state.level = input.value as Level;
    void saveProfile({ level: state.level });
  } else if (input.name === 'provider') {
    state.provider = input.value as Provider;
    state.keyStatus = { kind: 'idle' };
    render();
  }
});

app.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.target as HTMLElement).id === 'key') { e.preventDefault(); void testKey(); }
});

void (async () => {
  settings = await loadSettings();
  const { profile } = await ask<{ profile: Profile }>({ type: 'pp:profile:get' });
  state.goals = profile.goals;
  state.level = profile.level;
  state.provider = settings.provider;
  state.hasKey = { groq: !!settings.keys.groq, anthropic: !!settings.keys.anthropic };
  const commands = await chrome.commands.getAll();
  state.shortcut = commands.find((c) => c.name === 'pick')?.shortcut || null;
  render();
})();
