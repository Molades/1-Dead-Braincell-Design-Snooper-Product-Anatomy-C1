# Submitting Pixel Peeper (unlisted)

1. **Developer account** — register at https://chrome.google.com/webstore/devconsole (one-time $5). Use a shared team Google account if more than one person will publish.
2. **Privacy policy** — add a contact email and date to `docs/PRIVACY.md`, then publish it at a public URL (GitHub Pages, Notion public page, or any site).
3. **Build the package** — from the repo root:
   ```bash
   npm run zip:ext
   ```
   Upload `apps/extension/dist/pixel-peeper-<version>-chrome.zip`. This is the own-key build (no `WXT_LESSONS_MODE` set).
4. **Listing** — fill in from `docs/store/LISTING.md`; upload the 128px icon and 1 to 5 screenshots.
5. **Privacy practices** — single purpose, permission justifications, data usage, privacy policy URL (all in `LISTING.md`).
6. **Distribution** — set **Visibility: Unlisted**.
7. **Submit for review** — usually a few days. Share the listing link with testers once approved.

## Updating later

Bump `version` in `apps/extension/package.json` (the store rejects a repeated version), run `npm run zip:ext`, upload the new zip on the same item. Users update automatically.

## Switching to hosted lessons later

Deploy `apps/api` (see its README), set `WXT_LESSONS_MODE=hosted` and `WXT_API_URL=...` in `apps/extension/.env.production`, update `docs/PRIVACY.md` and the store's data disclosures (screenshots then go to your server), bump the version, and upload.
