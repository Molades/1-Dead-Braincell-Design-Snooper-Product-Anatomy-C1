# Pixel Peeper website

Static product site (About, Features, How to, Privacy, FAQ) in the extension's visual language. No build step.

Preview: `python3 -m http.server 8790 --directory apps/site`, then open http://localhost:8790.

- Fonts and detective poses in `assets/` are copies of `apps/extension/public/`; `icons.js` is generated from
  `apps/extension/components/icons.ts`. Re-copy them if those change.
- Download buttons point to `releases/latest/download/pixel-peeper-chrome.zip` on the Molades repo, so each GitHub release must attach a zip with exactly that name (the `pixel-peeper/` folder from `npm run build:ext`).
- The hero's Measured chips are computed from the mock card at runtime; the headline and Inferred lines are fixed copy.

Hosting: deployed on Vercel from `anamnasim26/pixel-peeper-site` (this folder split out with
`git subtree split --prefix=apps/site`), Framework Preset "Other", no build command.
