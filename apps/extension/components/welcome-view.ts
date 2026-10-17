import type { Goal, Level } from '@pixelpeeper/schema';
import { esc, inferredTag, measuredTag } from './lesson';
import { icon } from './icons';
import { liveDetective } from './live-eyes';

/**
 * Onboarding views. Pure functions returning HTML; state and motion live in the welcome page.
 * The shell (header, progress) renders once; only the step body is swapped, so the progress
 * bar and the page background can animate between steps instead of being rebuilt.
 */

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

/** Detective poses, cut from the supplied sheet by scripts/cut-poses.py and vectorised by scripts/vectorize-poses.py (public/poses/*.svg). */
export type Pose = 'peek' | 'think' | 'laptop' | 'idea' | 'getaway';
export const poseUrl = (pose: Pose) => `/poses/${pose}.svg`;

const LAST = WELCOME_STEPS.length - 1;

// One stroke weight, one corner style: authored icons, not glyphs.
const svg = (d: string, cls = 'ico') =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const ICON = {
  arrow: icon('arrow-right', 18),
  back: icon('arrow-left', 18),
  check: svg('<path class="draw" d="m5 12.5 4.5 4.5L19 7.5"/>'),
  lock: icon('lock-simple', 18),
  alert: icon('warning', 16),
  replay: icon('arrow-counter-clockwise', 14),
  puzzle: icon('puzzle-piece', 18),
  pin: icon('push-pin', 16),
  sparkle: icon('sparkle', 16),
  cursor: `<svg class="cursor-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3.5 18.5 12l-6 1.6-3 5.9z" fill="#1b1c1f" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/></svg>`,
};

/** The detective. Decorative: the copy carries the meaning. */
export const mascot = (pose: Pose, extra = '') =>
  pose === 'peek'
    ? liveDetective(`mascot ${extra}`)
    : `<img class="mascot ${extra}" src="${poseUrl(pose)}" alt="" aria-hidden="true" draggable="false" data-pose="${pose}">`;

const progress = (step: number) =>
  `<ol class="progress" aria-label="Setup progress">${WELCOME_STEPS.map(
    (s, i) => `<li class="${i < step ? 'done' : i === step ? 'now' : ''}" ${i === step ? 'aria-current="step"' : ''}><span class="sr">Step ${i + 1} of ${WELCOME_STEPS.length}: </span><span class="label">${s}</span><i class="fill"></i></li>`,
  ).join('')}</ol>`;

const nav = (s: WelcomeState, next = 'Continue') =>
  `<div class="nav" data-reveal>${s.step > 0 ? `<button class="quiet back" data-go="back">${ICON.back}<span>Back</span></button>` : '<span></span>'}<button class="primary" data-go="next"><span>${next}</span>${ICON.arrow}</button></div>`;

function whatItDoes(s: WelcomeState): string {
  return `<div class="intro">
      <h1 data-reveal tabindex="-1">Every website has something to teach you.</h1>
      <p class="lead" data-reveal>Pick any detail on a live page. Pixel Peeper reads its real styles, checks them against design and accessibility rules, and explains why it works.</p>
    </div>
    <figure class="demo" data-reveal aria-label="Example: picking a button on a page and reading its lesson">
      ${mascot('peek', 'peeker')}
      <div class="browser">
        <div class="browser-bar" aria-hidden="true"><i></i><i></i><i></i><span class="url">acme.design/pricing</span></div>
        <div class="site">
          <div class="plan" data-pick="Card">
            <p class="plan-name" data-pick="Heading">Pro</p>
            <p class="plan-price" data-pick="Price"><b>$24</b> per month</p>
            <ul class="plan-list"><li>Unlimited projects</li><li>Version history</li></ul>
            <span class="plan-cta" data-pick="Button">Start free trial</span>
          </div>
        </div>
        <div class="pick-outline" aria-hidden="true"><i class="wash"></i><i class="e t"></i><i class="e b"></i><i class="e l"></i><i class="e r"></i><i class="hd nw"></i><i class="hd ne"></i><i class="hd sw"></i><i class="hd se"></i><span class="pick-tag"></span></div>
        <div class="beam" aria-hidden="true"></div>
        <span class="cursor" aria-hidden="true">${ICON.cursor}</span>
      </div>
      <div class="lesson-card" aria-label="Example lesson">
        <div class="lesson-head"><span class="lc-mark">${liveDetective('tiny')}</span><strong>Plan call-to-action</strong><span>acme.design · Pricing</span></div>
        <div class="claim">${inferredTag()}<p class="hl">The only dark, filled shape in a light card, so it reads as the plan’s main action.</p></div>
        <div class="claim chips"><span class="chip"><i class="mdot"></i>Contrast <b data-measure="contrast">16.1:1</b></span><span class="chip"><i class="mdot"></i>Target <b data-measure="size">164×40px</b></span></div>
      </div>
      <figcaption class="demo-foot"><span class="hint">Hover the card to measure it yourself.</span><button class="quiet small" data-demo="replay">${ICON.replay}<span>Replay</span></button></figcaption>
    </figure>
    <ul class="explain" data-reveal>
      <li>${measuredTag()}<span>Read straight from the page by code. Same answer every time.</span></li>
      <li>${inferredTag()}<span>The AI’s interpretation, always tied to a measured value. Never a made-up number.</span></li>
    </ul>
    ${nav(s, 'Get started')}`;
}

function whatYouWant(s: WelcomeState): string {
  return `<div class="ask" data-reveal>${mascot('think', 'speaker')}<div class="bubble"><h1 tabindex="-1">What do you want from it?</h1><p>This only changes defaults and how lessons are written. It stays on this device.</p></div></div>
    <fieldset class="choices goals" data-reveal><legend>Your goals <span>choose any</span></legend>${GOALS.map((g) => `<label class="choice"><input type="checkbox" name="goal" value="${g.id}" ${s.goals.includes(g.id) ? 'checked' : ''}><span class="tick">${ICON.check}</span><span class="text"><strong>${g.title}</strong><em>${g.detail}</em></span></label>`).join('')}</fieldset>
    <fieldset class="choices levels" data-reveal><legend>Your level</legend>${LEVELS.map((l) => `<label class="choice"><input type="radio" name="level" value="${l.id}" ${s.level === l.id ? 'checked' : ''}><span class="dot"></span><span class="text"><strong>${l.title}</strong><em>${l.detail}</em></span></label>`).join('')}</fieldset>
    ${nav(s)}`;
}

function aiLessons(s: WelcomeState): string {
  const allowance = s.dailyLimit ? `You get <b>${s.dailyLimit} AI lessons a day</b>, free.` : 'AI lessons are included, free, with a daily allowance.';
  return `<div class="ask" data-reveal>${mascot('laptop', 'speaker')}<div class="bubble"><h1 tabindex="-1">Lessons are included</h1><p>${allowance} No account or API key needed.</p></div></div>
    <ul class="explain" data-reveal>
      <li>${measuredTag()}<span><b>Free, unlimited:</b> measurements, rule checks, the annotated viewer, your Library and exports.</span></li>
      <li>${inferredTag()}<span><b>Counts toward today:</b> each lesson, and each “Explain the differences” in Compare.</span></li>
    </ul>
    <p class="what" data-reveal>${ICON.lock}<span>When you choose <b>Get lesson</b>, Pixel Peeper sends a screenshot of your selection and its measured values to its server, which asks an AI model (Groq) for the lesson. Screenshots are not stored. Nothing is sent while you hover or pick, and the page address is not included.</span></p>
    ${nav(s)}`;
}

function tryIt(s: WelcomeState): string {
  return `<div class="ask" data-reveal>${mascot('idea', 'speaker')}<div class="bubble"><h1 tabindex="-1">You’re set. Try it on any site.</h1><p>Good first picks: a pricing card, a primary button, a navigation bar.</p></div></div>
    <figure class="toolbar-demo" data-reveal aria-label="Pin Pixel Peeper from the puzzle menu in Chrome’s toolbar">
      <div class="tb">
        <span class="tb-url"></span>
        <span class="tb-slot" aria-hidden="true">${mascot('peek', 'tb-icon')}</span>
        <span class="tb-btn tb-puzzle" aria-hidden="true">${ICON.puzzle}</span>
        <span class="tb-avatar" aria-hidden="true"></span>
        <div class="tb-menu" aria-hidden="true"><p>Extensions</p><div class="tb-row">${mascot('peek', 'tb-row-icon')}<span>Pixel Peeper</span><span class="tb-pin">${ICON.pin}</span></div></div>
        <span class="cursor" aria-hidden="true">${ICON.cursor}</span>
      </div>
    </figure>
    <ol class="how" data-reveal>
      <li><strong>Pin it.</strong> Click the puzzle piece in Chrome’s toolbar, then the pin next to Pixel Peeper.</li>
      <li><strong>Pick something.</strong> Click the Pixel Peeper icon${s.shortcut ? ` or press <kbd>${esc(s.shortcut)}</kbd>` : ''}, hover a card or button, use <kbd>↑</kbd> <kbd>↓</kbd> to adjust, then <b>Get lesson</b>.</li>
      <li><strong>Keep what teaches you something.</strong> Every lesson lands in Recent; save the good ones as ideas and compare them later in the Library.</li>
    </ol>
    <div class="nav" data-reveal><button class="quiet back" data-go="back">${ICON.back}<span>Back</span></button><div class="nav-right"><button class="secondary" data-go="library">Open Library</button><button class="primary" data-go="done"><span>Done</span>${ICON.arrow}</button></div></div>`;
}

/** Body of one step: the only part that is replaced when moving between steps. */
export function stepView(s: WelcomeState): string {
  return [whatItDoes, whatYouWant, aiLessons, tryIt][s.step]!(s);
}

/** The sound switch: an equaliser that dances while the score plays. */
const soundToggle = () =>
  `<button class="sound-toggle" data-go="sound" aria-pressed="false" title="Music and sound"><span class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="lbl">Sound off</span></button>`;

export function headerView(s: WelcomeState): string {
  return `<header class="top"><div class="brand">${mascot('peek', 'brand-mark')}<span>Pixel Peeper</span></div><div class="top-right">${soundToggle()}${s.step < LAST ? '<button class="quiet skip" data-go="skip">Skip setup</button>' : '<span class="skip-gap"></span>'}</div></header>${progress(s.step)}`;
}

export function welcomeView(s: WelcomeState): string {
  return `${headerView(s)}<section class="step" data-step="${s.step}">${stepView(s)}</section>`;
}
