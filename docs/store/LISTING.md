# Chrome Web Store listing — Pixel Peeper (unlisted)

Copy these into the Developer Dashboard. Character limits are the store's.

## Store listing

**Name** (max 75): Pixel Peeper

**Summary** (max 132):
Pick any part of a website and learn why its design works: measured styles, accessibility checks and an AI design lesson.

**Category:** Tools  ·  **Language:** English

**Description:**

Pixel Peeper turns any website into a design lesson. It is Inspect Element for design language instead of code.

Pick a button, a card, a menu, anything you like. Pixel Peeper reads its real styles straight from the page and explains why it works.

• Measured facts: font, size, weight, colors, spacing, corner radius, contrast, target size. Read by code, so they are exact.
• Accessibility checks: WCAG contrast and target size, alt text and names, with the criterion behind every result.
• An AI design lesson: what it is for, how it gets attention, what works, what to watch, and an idea to reuse. Every AI claim is labelled Inferred and must point at a measured fact, so it never invents numbers.
• Annotated screenshots: spacing, type, color and targets drawn over what you picked.
• A library of ideas, organised by website. Search, add notes, and compare two or three side by side.
• Build a design direction by borrowing from each idea, with contrast recomputed for new colour pairings. Export DESIGN.md, design tokens (W3C format) or CSS variables.

Bring your own key: lessons use your own Groq or Anthropic API key, sent only to that provider. Measurements, rule checks, the viewer and your library work without a key. Everything you save stays in your browser.

Shortcut: Alt+P (Option+P on Mac) to start picking.

**Screenshots** (1280×800 or 640×400, PNG or JPEG, 1 to 5):
1. A lesson open next to a picked card (Lesson tab).
2. The annotated full-screen viewer (Spacing + Issues on).
3. The Library home with ideas grouped by site.
4. Compare with the measured diff and "What to borrow".
5. Welcome: Measured vs Inferred.

**Icon:** `apps/extension/public/icon/128.png`  ·  **Small promo tile** (440×280): optional.

## Privacy practices tab

**Single purpose:**
Explain the visual design of a part of a web page the user picks: measure its styles, check accessibility rules, and generate a design lesson the user can save, compare and export.

**Permission justifications:**
- `activeTab`: Shows the picker and lesson panel on the current tab only after the user clicks the extension icon or presses its shortcut. No access to other tabs.
- `scripting`: Injects the picker into a tab that was open before the extension was installed or updated, when the user clicks the icon. Without it the click silently fails on those tabs.
- `storage`: Saves the user's library (captures, lessons, notes), settings, setup answers and API key in the browser.
- `unlimitedStorage`: Each saved idea keeps its screenshot; the default 10 MB limit fills after a few dozen saves.
- Host permission `https://api.groq.com/*`, `https://api.anthropic.com/*`: Sends the lesson request to the AI provider the user selected, with the user's own API key. No other hosts.

**Remote code:** No. All code is in the package; the extension only exchanges data (JSON) with the AI provider.

**Data usage** (what the extension handles; nothing is collected by the developer):
- Website content: a screenshot of the selected part of the page and its measured styles are sent to the user's chosen AI provider when the user asks for a lesson.
- Authentication information: the user's AI provider API key is stored locally and sent only to that provider.
- Not collected: personal identity, health, financial, location, web history, user activity, personal communications.

Certify: not sold to third parties; not used or transferred for purposes unrelated to the single purpose; not used for creditworthiness or lending.

**Privacy policy URL:** _the public URL where `docs/PRIVACY.md` is hosted_

## Distribution

**Visibility:** Unlisted (only people with the link can install).  ·  **Regions:** All.
