/**
 * Onboarding backdrop: a dithered landscape made of the product's own material, pixels.
 *
 * Ridges are layered value-noise curves shaded with ordered (Bayer) dithering into a dot grid, in the
 * indigo ramp. Far ridges are pale and misty, near ones dense. It drifts slowly with parallax, mist rolls
 * through, and a soft lens follows the cursor and sharpens the pixels under it, the way the detective
 * inspects a page. A few pixels glint in mascot yellow.
 *
 * Manners: drawn at grid resolution and scaled up (cheap), capped at 30fps, paused while the tab is
 * hidden, a still frame under reduced motion, and decorative only (aria-hidden, no pointer capture).
 */

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);

// Indigo ramp from DESIGN.md (primary #5e6ad2), far to near. Far ridges are pale and misty, the
// foreground is deep indigo; tone falls off sharply between layers so each ridge reads as a silhouette.
const LAYERS = [
  { rgb: [196, 201, 243], base: 0.40, amp: 0.24, freq: 0.7, speed: 0.004, density: 0.30, peaks: 0.75 },
  { rgb: [150, 159, 230], base: 0.54, amp: 0.22, freq: 1.1, speed: 0.008, density: 0.44, peaks: 0.8 },
  { rgb: [110, 121, 216], base: 0.68, amp: 0.18, freq: 1.6, speed: 0.014, density: 0.58, peaks: 0.6 },
  { rgb: [78, 90, 196], base: 0.84, amp: 0.12, freq: 2.2, speed: 0.022, density: 0.74, peaks: 0.45 },
];
const GLINT = [245, 200, 76];

function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
function noise1(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) * (1 - u) + hash(i + 1) * u;
}
function fbm1(x: number) {
  return noise1(x) * 0.6 + noise1(x * 2.13 + 7.1) * 0.28 + noise1(x * 4.7 + 3.3) * 0.12;
}
function noise2(x: number, y: number) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const h = (a: number, b: number) => hash(a * 57.3 + b * 113.7);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

export function mountPixelLandscape(host: HTMLElement = document.body) {
  const canvas = document.createElement('canvas');
  canvas.className = 'pixel-landscape';
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => canvas.remove();

  const CELL = 3; // css px per dot cell; each cell draws a 2px dot with a 1px gap
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const buf = document.createElement('canvas');
  const bctx = buf.getContext('2d')!;
  let cols = 0, rows = 0, img: ImageData | null = null;
  let lens = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4 };
  let raf = 0, last = 0, t = 0;

  function size() {
    const r = canvas.getBoundingClientRect();
    cols = Math.max(1, Math.ceil(r.width / CELL));
    rows = Math.max(1, Math.ceil(r.height / CELL));
    // 3x3 source pixels per cell: a 2x2 dot plus gap, 1:1 with CSS pixels.
    buf.width = cols * 3;
    buf.height = rows * 3;
    img = bctx.createImageData(buf.width, buf.height);
    const dpr = Math.min(2, devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    draw();
  }

  function draw() {
    if (!img) return;
    const d = img.data;
    d.fill(0);
    const rect = canvas.getBoundingClientRect();
    const lx = (lens.x - rect.left) / CELL, ly = (lens.y - rect.top) / CELL;
    const lensR = 34; // cells
    // Keep the reading column calm: the field is faint behind the 760px content column and full at the
    // sides, so the mountains frame the content instead of sitting under it. Narrow screens get a
    // uniformly faint field.
    const half = 380 / CELL, mid = cols / 2, narrow = rect.width < 820;
    for (let cx = 0; cx < cols; cx++) {
      const u = cx / cols;
      const off = Math.abs(cx - mid) - half;
      const colMul = narrow ? 0.42 : 0.2 + 0.8 * Math.min(1, Math.max(0, (off + 40) / 110)) ** 1.5;
      // Ridge heights for every layer at this column (0 = top of canvas, 1 = bottom).
      // Peaked ridges: blend smooth noise with a ridged (folded) version so crests come to points.
      const heights = LAYERS.map((L, i) => {
        const n = fbm1(u * L.freq * 3 + i * 17.3 + t * L.speed);
        const ridged = 1 - Math.abs(2 * n - 1);
        return L.base - (ridged * L.peaks + n * (1 - L.peaks) - 0.45) * L.amp * 2;
      });
      for (let cy = 0; cy < rows; cy++) {
        const v = cy / rows;
        // Front-most layer whose ridge is above this cell.
        let li = -1;
        for (let i = LAYERS.length - 1; i >= 0; i--) if (v >= heights[i]!) { li = i; break; }
        if (li < 0) continue;
        const L = LAYERS[li]!;
        const depth = Math.min(1, (v - heights[li]!) / 0.3); // crest is lighter, body denser
        let dens = L.density * (0.62 + 0.38 * depth);
        // A crisp contour along each crest, like the pick outline drawn around an element.
        if (v - heights[li]! < 0.012) dens += 0.38;
        // Valley mist: just above the next ridge in front, the air thickens and the far ridge fades,
        // which is what separates the layers (as in a misty mountain range).
        const front = li + 1 < LAYERS.length ? heights[li + 1]! - v : 1;
        if (front > 0 && front < 0.14) dens -= (1 - front / 0.14) * 0.42 * (1 - li * 0.18);
        // Rolling mist drifting slowly across the far layers.
        const mist = noise2(cx * 0.03 + t * 0.06, cy * 0.06 - t * 0.01);
        dens -= Math.max(0, mist - 0.45) * (0.9 - li * 0.2);
        // Fade the whole field out toward the top so content above stays calm.
        dens *= Math.min(1, Math.max(0, (v - 0.18) / 0.35)) * colMul;
        // The lens: pixels under the cursor sharpen into a cleaner, denser read.
        const dx = cx - lx, dy = (cy - ly) * 1.15, dist = Math.sqrt(dx * dx + dy * dy);
        const inLens = dist < lensR ? 1 - dist / lensR : 0;
        dens += inLens * 0.22;
        if (dens <= BAYER[(cy & 3) * 4 + (cx & 3)]!) continue;
        let [r, g, b] = L.rgb as [number, number, number];
        if (inLens > 0) { const k = inLens * 0.4; r += (52 - r) * k; g += (60 - g) * k; b += (170 - b) * k; }
        // Rare, slow glints in mascot yellow.
        const gl = hash(cx * 31.7 + cy * 91.3);
        if (gl > 0.9985 && Math.sin(t * 0.9 + gl * 400) > 0.6) [r, g, b] = GLINT as [number, number, number];
        // 2x2 dot inside the 3x3 cell.
        for (let py = 0; py < 2; py++) {
          let o = ((cy * 3 + py) * buf.width + cx * 3) * 4;
          for (let px = 0; px < 2; px++, o += 4) { d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = 240; }
        }
      }
    }
    bctx.putImageData(img, 0, 0);
    ctx!.imageSmoothingEnabled = false;
    ctx!.clearRect(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / Math.max(1, rect.width); // device pixels per CSS pixel
    ctx!.drawImage(buf, 0, 0, buf.width * scale, buf.height * scale);
  }

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return; // ~30fps is plenty for a slow drift
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    t += dt;
    lens.x += (lens.tx - lens.x) * 0.12;
    lens.y += (lens.ty - lens.y) * 0.12;
    draw();
  }

  function start() { if (!raf && !reduced.matches && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  const onMove = (e: PointerEvent) => { lens.tx = e.clientX; lens.ty = e.clientY; if (reduced.matches) return; if (lens.x < -1e3) { lens.x = lens.tx; lens.y = lens.ty; } };
  const onLeave = () => { lens.tx = -1e4; lens.ty = -1e4; };
  const onVis = () => (document.hidden ? stop() : start());
  const onMotion = () => { stop(); if (!reduced.matches) start(); else draw(); };

  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  addEventListener('pointermove', onMove, { passive: true });
  document.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', onVis);
  reduced.addEventListener('change', onMotion);
  size();
  start();

  return () => {
    stop();
    ro.disconnect();
    removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVis);
    reduced.removeEventListener('change', onMotion);
    canvas.remove();
  };
}
