// Pixel Peeper website: icons, header, scroll reveals and the hero demo.
// The demo's Measured chips are read from the mock card with getComputedStyle, like the extension does;
// only the headline and the Inferred line are written ahead of time.

// Set this to the Chrome Web Store listing once it is published; until then the buttons read "Coming soon".
const STORE_URL = '';

document.documentElement.classList.add('js');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Icons ------------------------------------------------------------------------------------------
for (const el of document.querySelectorAll('i[data-icon]')) {
  const d = window.PP_ICONS[el.dataset.icon];
  if (!d) continue;
  el.outerHTML = `<svg class="ph${el.className ? ` ${el.className}` : ''}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${d}</svg>`;
}

if (STORE_URL) for (const el of document.querySelectorAll('[data-store]')) {
  const a = document.createElement('a');
  a.className = el.className.replace('soon', 'primary');
  a.href = STORE_URL; a.target = '_blank'; a.rel = 'noopener';
  a.innerHTML = `Add to Chrome${el.classList.contains('small') ? '' : ` <svg class="ph" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${window.PP_ICONS['arrow-right']}</svg>`}`;
  el.replaceWith(a);
}

// ---- Header shadow once the page scrolls -------------------------------------------------------------
const header = document.querySelector('.top');
const onScroll = () => header.classList.toggle('scrolled', scrollY > 8);
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ---- Reveal on scroll ----------------------------------------------------------------------------------
const revealTargets = document.querySelectorAll('.watch-head, .player, .section-head, .about-copy, .ev, .pr, .feature, .detective, .step, .ledger, .faq, .closing-card');
if ('IntersectionObserver' in window && !reduced) {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  revealTargets.forEach((el, i) => {
    el.setAttribute('data-reveal', '');
    el.style.transitionDelay = `${(i % 3) * 60}ms`;
    io.observe(el);
  });
}

// ---- Film: a big play button over the poster; native controls once it starts -------------------------
const film = document.querySelector('.screen video');
const play = document.querySelector('.screen .play');
if (film && play) {
  film.controls = false;
  play.hidden = false;
  play.addEventListener('click', () => { film.controls = true; film.play(); });
  film.addEventListener('play', () => { play.hidden = true; });
  film.addEventListener('ended', () => { film.controls = false; film.load(); play.hidden = false; });
}

// ---- Hero demo -----------------------------------------------------------------------------------------
const stage = document.querySelector('[data-stage]');
const pick = stage.querySelector('.pick');
const pickTag = pick.querySelector('.tag');
const lesson = document.querySelector('.lesson');
const slot = (k) => lesson.querySelector(`[data-l="${k}"]`);

const px = (v) => `${Math.round(parseFloat(v))}px`;
const chip = (label, value) => `<span class="chip"><span class="mdot"></span>${label}<b>${value}</b></span>`;

function rgb(str) {
  const m = str.match(/[\d.]+/g);
  return m ? { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] } : null;
}
function luminance({ r, g, b }) {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function backgroundOf(el) {
  for (let n = el; n; n = n.parentElement) {
    const c = rgb(getComputedStyle(n).backgroundColor);
    if (c && c.a > 0) return c;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}
function contrast(el, textEl = el) {
  const fg = luminance(rgb(getComputedStyle(textEl).color));
  const bg = luminance(backgroundOf(el));
  const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  return `${ratio.toFixed(1)}:1`;
}

const TARGETS = {
  button: {
    name: 'Button',
    headline: 'A dark, solid button reads as the one thing to do.',
    why: 'Everything else on the card is grey or white, so the only high-contrast shape pulls the eye to the action.',
    chips: (el, cs) => [chip('Contrast', contrast(el)), chip('Height', px(el.offsetHeight)), chip('Radius', px(cs.borderTopLeftRadius))],
  },
  price: {
    name: 'Price',
    headline: 'The price is the loudest thing on the card.',
    why: 'At more than twice the body size and in a heavier face, it is read before the plan name or the list.',
    chips: (el) => {
      const b = el.querySelector('b'); const bs = getComputedStyle(b);
      const body = parseFloat(getComputedStyle(el).fontSize);
      return [chip('Size', px(bs.fontSize)), chip('Weight', bs.fontWeight), chip('Scale', `${(parseFloat(bs.fontSize) / body).toFixed(1)}×`)];
    },
  },
  label: {
    name: 'Plan label',
    headline: 'The plan name is small and grey, so it supports the price.',
    why: 'It names the card without competing with it. Muted, not faint: contrast still clears the AA line for small text.',
    chips: (el, cs) => [chip('Size', px(cs.fontSize)), chip('Weight', cs.fontWeight), chip('Contrast', contrast(el))],
  },
  card: {
    name: 'Card',
    headline: 'A soft shadow lifts the card instead of a hard border.',
    why: 'The edge separates the plan from the dotted backdrop without adding another line for the eye to read.',
    chips: (el, cs) => [chip('Size', `${el.offsetWidth}×${el.offsetHeight}`), chip('Padding', px(cs.paddingTop)), chip('Radius', px(cs.borderTopLeftRadius))],
  },
};
const ORDER = ['button', 'price', 'label', 'card'];
let current = null;

function select(key, instant = false) {
  const el = stage.querySelector(`[data-pick="${key}"]`);
  if (!el || key === current) return;
  current = key;
  const t = TARGETS[key];
  const cs = getComputedStyle(el);
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const pad = 3;
  pick.style.transform = `translate(${r.left - s.left - pad}px, ${r.top - s.top - pad}px)`;
  pick.style.width = `${r.width + pad * 2}px`;
  pick.style.height = `${r.height + pad * 2}px`;
  pick.style.borderRadius = `${(parseFloat(cs.borderTopLeftRadius) || 4) + pad}px`;
  pick.classList.add('on');
  pickTag.textContent = `${t.name} · ${Math.round(r.width)}×${Math.round(r.height)}`;

  const fill = () => {
    slot('title').textContent = t.name;
    slot('headline').textContent = t.headline;
    slot('chips').innerHTML = t.chips(el, cs).join('');
    slot('why').textContent = t.why;
    lesson.classList.remove('swap');
  };
  if (reduced || instant) return fill();
  lesson.classList.add('swap');
  setTimeout(() => current === key && fill(), 160);
}

// Hover and keyboard focus pick the deepest target under the pointer.
stage.addEventListener('pointerover', (e) => { const el = e.target.closest('[data-pick]'); if (el) { pause(); select(el.dataset.pick); } });
stage.addEventListener('focusin', (e) => { const el = e.target.closest('[data-pick]'); if (el) { pause(); select(el.dataset.pick); } });

// When nobody is pointing at it, the demo walks through the targets on its own.
let timer = 0; let resume = 0; let visible = false;
function cycle() {
  clearInterval(timer);
  if (reduced || !visible) return;
  timer = setInterval(() => select(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]), 3200);
}
function pause() { clearInterval(timer); clearTimeout(resume); resume = setTimeout(cycle, 6000); }
new IntersectionObserver(([e]) => { visible = e.isIntersecting; visible ? cycle() : clearInterval(timer); }).observe(stage);
document.addEventListener('visibilitychange', () => (document.hidden ? clearInterval(timer) : cycle()));

// Re-place the outline after fonts load or the layout changes size.
const replace = () => { const k = current; current = null; select(k || 'button', true); };
document.fonts?.ready.then(replace);
addEventListener('resize', replace);
replace();
