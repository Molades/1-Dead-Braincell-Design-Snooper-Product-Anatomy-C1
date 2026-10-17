import type { Goal, Level, Profile } from '@pixelpeeper/schema';
import type { Quota } from '../../components/service';
import { WELCOME_STEPS, welcomeView, type WelcomeState } from '../../components/welcome-view';
import './welcome.css';

/** First-run setup. Every step is optional; answers are saved as you go. */

const app = document.getElementById('app')!;
const state: WelcomeState = { step: 0, goals: ['learn'], level: 'practising', dailyLimit: null, shortcut: null };

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

app.addEventListener('click', (e) => {
  const t = (e.target as Element).closest<HTMLButtonElement>('button');
  if (!t) return;
  if (t.dataset.go) void go(t.dataset.go);
});

app.addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement;
  if (input.name === 'goal') {
    state.goals = [...app.querySelectorAll<HTMLInputElement>('input[name=goal]:checked')].map((i) => i.value as Goal);
    void saveProfile({ goals: state.goals });
  } else if (input.name === 'level') {
    state.level = input.value as Level;
    void saveProfile({ level: state.level });
  }
});


void (async () => {
  const { profile } = await ask<{ profile: Profile }>({ type: 'pp:profile:get' });
  state.goals = profile.goals;
  state.level = profile.level;
  // Registers this install with the service and reads the allowance (works offline too: just unknown).
  const q = (await ask<{ quota?: Quota | null }>({ type: 'pp:quota' }).catch(() => null))?.quota;
  state.dailyLimit = q?.limit ?? null;
  const commands = await chrome.commands.getAll();
  state.shortcut = commands.find((c) => c.name === 'pick')?.shortcut || null;
  render();
})();
