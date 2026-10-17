/**
 * A small detective with live eyes, for extension pages (the in-page launcher has its own, in mascot.ts).
 * The eyes follow the pointer while it moves; when it rests they keep living: quick glances, the odd
 * slow roll, and blinks. Reduced motion keeps them still; a hidden tab stops the loop.
 */

export const liveDetective = (cls = '') =>
  `<span class="live-det ${cls}" aria-hidden="true"><img src="/poses/peek-face.svg" alt="" draggable="false"><span class="eye l"><i></i></span><span class="eye r"><i></i></span></span>`;

export function animateEyes(scope: ParentNode = document) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let pointer: { x: number; y: number } | null = null;
  let lastMove = 0;
  const state = new WeakMap<Element, { x: number; y: number; tx: number; ty: number; next: number; roll: number; blink: number }>();

  addEventListener('pointermove', (e) => { pointer = { x: e.clientX, y: e.clientY }; lastMove = performance.now(); }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = null; });

  function step(now: number) {
    requestAnimationFrame(step);
    if (document.hidden || reduced.matches) return;
    for (const det of scope.querySelectorAll<HTMLElement>('.live-det')) {
      const eye = det.querySelector<HTMLElement>('.eye');
      if (!eye) continue;
      let s = state.get(det);
      if (!s) { s = { x: 0, y: 0, tx: 0, ty: 0, next: 0, roll: 0, blink: now + 1500 + Math.random() * 3000 }; state.set(det, s); }
      const er = eye.getBoundingClientRect();
      if (!er.width) continue;
      const max = { x: er.width * 0.24, y: er.height * 0.2 };
      const r = det.getBoundingClientRect();
      let ux = 0, uy = 0;
      if (pointer && now - lastMove < 1400) {
        const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height * 0.78);
        const d = Math.hypot(dx, dy) || 1, reach = Math.min(1, d / 260);
        ux = (dx / d) * reach; uy = (dy / d) * reach;
      } else if (s.roll) {
        const k = (now - s.roll) / 1100;
        if (k >= 1) { s.roll = 0; s.next = now + 500; }
        const a = -Math.PI / 2 + Math.min(1, k) * Math.PI * 2;
        ux = Math.cos(a); uy = Math.sin(a);
      } else {
        if (now >= s.next) {
          if (Math.random() < 0.15) s.roll = now;
          const a = Math.random() * Math.PI * 2, d = 0.35 + Math.random() * 0.65;
          s.tx = Math.cos(a) * d; s.ty = Math.sin(a) * d * 0.8;
          s.next = now + 700 + Math.random() * 1700;
        }
        ux = s.tx; uy = s.ty;
      }
      const k = pointer && now - lastMove < 1400 ? 0.2 : 0.3;
      s.x += (ux * max.x - s.x) * k; s.y += (uy * max.y - s.y) * k;
      for (const p of det.querySelectorAll<HTMLElement>('.eye i')) p.style.transform = `translate(${s.x.toFixed(2)}px, ${s.y.toFixed(2)}px)`;
      if (now >= s.blink) {
        s.blink = now + 2400 + Math.random() * 3800;
        for (const e of det.querySelectorAll<HTMLElement>('.eye')) e.animate?.([{ transform: 'scaleY(1)' }, { transform: 'scaleY(.08)', offset: 0.45 }, { transform: 'scaleY(1)' }], { duration: 170, easing: 'ease-in-out' });
      }
    }
  }
  requestAnimationFrame(step);
}
