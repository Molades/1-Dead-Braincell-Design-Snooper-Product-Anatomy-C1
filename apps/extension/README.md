# Pixel Peeper extension UI scaffold

Run `npm run build:ext` from the repository root. In Chrome, open Extensions, enable Developer mode, choose Load unpacked, and select `apps/extension/.output/chrome-mv3`. Reload the webpage after installing. Click the extension action to reveal the corner mascot. Restricted browser/store pages cannot be inspected; a badge explains when activation fails.

The UI lives in `components/overlay.ts` and `components/overlay.css`. A Shadow DOM isolates it from page styles; it never changes the webpage viewport. The content entrypoint manages activation and cleanup. The background action sends activation, replacing automatic side-panel opening. Legacy side-panel code is retained under `legacy-sidepanel` and excluded from the extension build.

Implemented: mascot menu and collapse, keyboard selection/escape, parent/child controls, anchored outlines and scanning, movable measurements window, persistent local saved ideas, comparison of up to three references, category borrowing, provenance-aware Markdown/JSON/CSS download, save celebration, reduced motion, and teardown on extension invalidation.

Integration boundaries: computed styles use `@pixelpeeper/measure`; scan currently presents those facts without fabricated AI interpretations. Screenshot capture, model interpretation, rules service, aggregate page inventory, remote sync, and crop preview are pending. Whole-page selection currently measures the body and labels that limit. Scan's short animation is UI feedback, not network progress. Hover/selection never transmits page data.

UI preview: run `node_modules/.bin/vite --host 127.0.0.1 --port 8766`, then open `/docs/scaffold/`. The preview imports the actual UI module and substitutes only runtime asset URLs and local persistence. It is not the earlier static prototype.

Artwork: `public/detective-poses.png` is the supplied reference sheet, reused unchanged through CSS sprite positions. Production licensing remains to be confirmed.
