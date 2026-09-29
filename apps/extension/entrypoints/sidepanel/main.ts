import type { Facts } from '@pixelpeeper/schema';

const app = document.getElementById('app')!;
app.innerHTML = `
  <style>
    :root{color-scheme:light dark;font:14px/1.5 system-ui}
    body{margin:0;padding:16px}
    button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #7c3aed;background:#7c3aed;color:#fff;cursor:pointer}
    h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin:20px 0 6px;opacity:.7}
    dl{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0}
    dt{opacity:.7} dd{margin:0;font-variant-numeric:tabular-nums;word-break:break-word}
    .badge{font-size:10px;font-weight:600;padding:1px 6px;border-radius:99px;background:#7c3aed22;color:#7c3aed;margin-left:6px}
  </style>
  <button id="pick">Pick an element</button>
  <div id="out"><p>Click the button, then select an element on the page. ↑/↓ walks parent/child.</p></div>`;

const out = document.getElementById('out')!;

document.getElementById('pick')!.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'pp:start-pick' });
});

const row = (k: string, v: unknown) => `<dt>${k}</dt><dd>${String(v)}</dd>`;
const section = (title: string, rows: string) =>
  `<h2>${title}<span class="badge">Measured</span></h2><dl>${rows}</dl>`;

function render(f: Facts) {
  const c = f.color.contrast;
  out.innerHTML = [
    `<code>${f.selector}</code>`,
    section('Typography', [
      row('Family', f.typography.fontFamily.value), row('Size', `${f.typography.fontSize.value}px`),
      row('Weight', f.typography.fontWeight.value), row('Line height', f.typography.lineHeight.value ?? 'normal'),
      row('Letter spacing', `${f.typography.letterSpacing.value}px`),
    ].join('')),
    section('Color', [
      row('Text', f.color.text.value), row('Background', f.color.background.value),
      row('Contrast', c.canMeasure ? `${c.ratio}:1 · AA ${c.aa ? 'pass' : 'fail'} · AAA ${c.aaa ? 'pass' : 'fail'}` : `Can't measure — ${c.reason}`),
    ].join('')),
    section('Spacing', [
      row('Padding', f.spacing.padding.value.join(' ')), row('Margin', f.spacing.margin.value.join(' ')),
      row('Scale', f.spacing.scaleBase.value ? `multiples of ${f.spacing.scaleBase.value}` : 'off-grid'),
    ].join('')),
    section('Size', [row('W × H', `${f.size.width.value} × ${f.size.height.value}`)].join('')),
    section('Shape', [row('Radius', f.shape.borderRadius.value.join(' ')), row('Shadow', f.shape.boxShadow.value)].join('')),
    section('Structure', [row('Tag', f.structure.tag.value), row('Component', f.structure.componentType.value ?? '—')].join('')),
    section('Accessibility', [row('Tap target', `${f.a11y.tapTarget.value.meets44 ? 'meets' : 'below'} 44px`)].join('')),
    section('Consistency', [row('Same style on page', `${f.consistency.sameStyleCount.value}×`)].join('')),
  ].join('');
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'pp:selection') render(msg.facts as Facts);
});
