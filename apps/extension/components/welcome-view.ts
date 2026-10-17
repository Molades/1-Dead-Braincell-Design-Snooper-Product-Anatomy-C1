import type { Goal, Level } from '@pixelpeeper/schema';
import { esc } from './lesson';

/** Onboarding steps. Pure functions returning HTML; state lives in the welcome page. */

export const WELCOME_STEPS = ['What it does', 'What you want', 'Lessons', 'Try it'] as const;

export const GOALS: { id: Goal; title: string; detail: string }[] = [
  { id: 'learn', title: 'Learn why designs work', detail: 'Lessons explain the reasoning first.' },
  { id: 'library', title: 'Build a reference library', detail: 'Saving is one key away.' },
  { id: 'accessibility', title: 'Check accessibility', detail: 'Rule issues are summarised at the top.' },
  { id: 'tokens', title: 'Pull tokens for my own work', detail: 'Export is put up front.' },
];
export const LEVELS: { id: Level; title: string; detail: string }[] = [
  { id: 'student', title: 'Student', detail: 'Terms explained as you go' },
  { id: 'practising', title: 'Practising designer', detail: 'Standard vocabulary, practical' },
  { id: 'senior', title: 'Senior / lead', detail: 'Terse, trade-offs first' },
];

export interface WelcomeState {
  step: number;
  goals: Goal[];
  level: Level;
  /** Lessons per day included with the hosted service, once known. */
  dailyLimit: number | null;
  shortcut: string | null;
}

const progress = (step: number) =>
  `<ol class="progress" aria-label="Setup progress">${WELCOME_STEPS.map((s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}" ${i === step ? 'aria-current="step"' : ''}><span>${i + 1}</span>${s}</li>`).join('')}</ol>`;

const nav = (s: WelcomeState, next = 'Next') =>
  `<div class="nav">${s.step > 0 ? '<button data-go="back">Back</button>' : '<span></span>'}<div class="nav-right">${s.step < WELCOME_STEPS.length - 1 ? '<button class="link" data-go="skip">Skip setup</button>' : ''}<button class="primary" data-go="next">${next}</button></div></div>`;

function whatItDoes(s: WelcomeState): string {
  return `<h1>Every website has something to teach you.</h1>
    <p class="lead">Pick any detail on a live page. Pixel Peeper reads its real styles, checks them against design and accessibility rules, and explains why it works.</p>
    <div class="sample" aria-label="Example lesson">
      <div class="sample-head"><strong>Plan call-to-action</strong><span>Stripe · Pricing</span></div>
      <div class="sample-row"><span class="badge measured">Measured</span><p>Text contrast <b>15.4:1</b>, passes AA. Target <b>160×48px</b>. Padding <b>14px 28px</b> on an 8px grid.</p></div>
      <div class="sample-row"><span class="badge inferred">Inferred</span><p>A single dark pill likely makes this the plan’s main action, because it is the heaviest object in a light card.</p></div>
    </div>
    <ul class="explain"><li><span class="badge measured">Measured</span> read straight from the page by code. Same answer every time.</li><li><span class="badge inferred">Inferred</span> the AI’s interpretation, always tied to a measured value. Never a made-up number.</li></ul>
    ${nav(s, 'Get started')}`;
}

function whatYouWant(s: WelcomeState): string {
  return `<h1>What do you want from it?</h1>
    <p class="lead">This only changes defaults and how lessons are written. It stays on this device.</p>
    <fieldset class="choices"><legend>Your goals <span>choose any</span></legend>${GOALS.map((g) => `<label class="choice"><input type="checkbox" name="goal" value="${g.id}" ${s.goals.includes(g.id) ? 'checked' : ''}><span><strong>${g.title}</strong><em>${g.detail}</em></span></label>`).join('')}</fieldset>
    <fieldset class="choices levels"><legend>Your level</legend>${LEVELS.map((l) => `<label class="choice"><input type="radio" name="level" value="${l.id}" ${s.level === l.id ? 'checked' : ''}><span><strong>${l.title}</strong><em>${l.detail}</em></span></label>`).join('')}</fieldset>
    ${nav(s)}`;
}

function aiLessons(s: WelcomeState): string {
  return `<h1>Lessons are included</h1>
    <p class="lead">${s.dailyLimit ? `You get <b>${s.dailyLimit} AI lessons a day</b>, free.` : 'AI lessons are included, free, with a daily allowance.'} No account or API key needed.</p>
    <ul class="explain"><li><span class="badge measured">Free, unlimited</span> measurements, rule checks, the annotated viewer, your Library and exports.</li><li><span class="badge inferred">Counts toward today</span> each lesson, and each “Explain the differences” in Compare.</li></ul>
    <p class="what">When you choose <b>Get lesson</b>, Pixel Peeper sends a screenshot of your selection and its measured values to its server, which asks an AI model (Groq) for the lesson. Screenshots are not stored. Nothing is sent while you hover or pick, and the page address is not included.</p>
    ${nav(s)}`;
}

function tryIt(s: WelcomeState): string {
  return `<h1>You’re set. Try it on any site.</h1>
    <ol class="how">
      <li><strong>Pin it.</strong> Click the puzzle piece in Chrome’s toolbar, then the pin next to Pixel Peeper.</li>
      <li><strong>Pick something.</strong> Click the Pixel Peeper icon${s.shortcut ? ` or press <kbd>${esc(s.shortcut)}</kbd>` : ''}, hover a card or button, use <kbd>↑</kbd> <kbd>↓</kbd> to adjust, then <b>Get lesson</b>.</li>
      <li><strong>Keep what teaches you something.</strong> Every lesson lands in Recent; save the good ones as ideas and compare them later in the Library.</li>
    </ol>
    <p class="muted">Good first picks: a pricing card, a primary button, a navigation bar.</p>
    <div class="nav"><button data-go="back">Back</button><div class="nav-right"><button data-go="library">Open Library</button><button class="primary" data-go="done">Done</button></div></div>`;
}

export function welcomeView(s: WelcomeState): string {
  const body = [whatItDoes, whatYouWant, aiLessons, tryIt][s.step]!(s);
  return `<header class="brand">Pixel Peeper</header>${progress(s.step)}<section class="step">${body}</section>`;
}
