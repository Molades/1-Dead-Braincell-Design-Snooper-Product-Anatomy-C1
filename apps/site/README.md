# Pixel Peeper website

Static product site (About, Features, How to, Privacy, FAQ) in the extension's visual language. No build step.

Preview: `python3 -m http.server 8790 --directory apps/site`, then open http://localhost:8790.

- Fonts and detective poses in `assets/` are copies of `apps/extension/public/`; `icons.js` is generated from
  `apps/extension/components/icons.ts`. Re-copy them if those change.
- Set `STORE_URL` in `site.js` once the Chrome Web Store listing exists; until then "Add to Chrome" scrolls to the install step.
- The hero's Measured chips are computed from the mock card at runtime; the headline and Inferred lines are fixed copy.
