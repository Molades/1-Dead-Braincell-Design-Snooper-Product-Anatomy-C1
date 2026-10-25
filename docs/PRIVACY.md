# Pixel Peeper privacy policy

> Draft for review before publishing. Not legal advice. Add a contact email and publication date, then host it at a public URL for the Chrome Web Store listing.

**Last updated:** _date of publication_

Pixel Peeper is a browser extension that explains the design of parts of web pages you choose.
We (the Pixel Peeper team) do not run servers for this version, have no accounts, and do not
receive any of your data.

## What stays on your device

Everything you save stays in your browser: captures, screenshots, lessons, notes and comparisons,
your setup answers (goals and level), and your AI provider API key. None of it is sent to us.
Uninstalling the extension deletes it.

## What is sent, and where

Nothing is sent while you hover over or pick parts of a page. Only when you choose **Get lesson**,
the extension sends, directly from your browser to the AI provider you chose in settings
(Groq or Anthropic), using your own API key:

- a screenshot of the part of the page you selected (only what is visible on screen),
- measured style values of that selection (fonts, colors, spacing, sizes) and rule-check results,
- the level you chose during setup (student, practising, senior).

The page address (URL) is not sent. When you choose **Explain the differences** or **Draft
rationale** in Compare, the measured values and earlier lessons of those ideas are sent as text,
without screenshots.

When you test or save a key, the extension asks the provider for its list of models to check the
key works. This uses no tokens.

The provider processes these requests under its own terms and privacy policy, and usage is billed
to your account with them:

- Groq: https://groq.com/privacy-policy/
- Anthropic: https://www.anthropic.com/legal/privacy

## Permissions

- **activeTab, scripting**: to show Pixel Peeper on the page you are on, only after you click its icon or press its shortcut.
- **storage, unlimitedStorage**: to keep your library, screenshots and settings in your browser.
- **Access to api.groq.com and api.anthropic.com**: to request lessons from the provider you chose.

## What we do not do

No accounts, no analytics, no advertising, no selling data, no tracking of the sites you visit.

## Changes

If a future version sends data anywhere else (for example a Pixel Peeper lesson service), this
policy will be updated before that version is released.

## Contact

_Add a contact email before publishing._
