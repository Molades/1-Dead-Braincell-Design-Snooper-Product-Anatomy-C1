---
name: Pixel Peeper
description: A quiet floating workspace for learning from websites.
colors:
  primary: "#f9d54a"
  primary-hover: "#efc62e"
  primary-soft: "#fff3bd"
  selection: "#345be4"
  measured: "#216659"
  measured-bg: "#e0f2e9"
  inferred: "#665296"
  inferred-bg: "#eee8fa"
  ink: "#252523"
  muted: "#62625d"
  line: "#deded5"
  paper: "#f8f7f2"
  surface: "#fffefa"
  canvas: "#efeee7"
  hover: "#efeee4"
  evidence: "#315744"
  evidence-bg: "#eaf1eb"
typography:
  headline:
    fontFamily: "Georgia, serif"
    fontSize: "29px"
    fontWeight: 400
    lineHeight: 1.12
    letterSpacing: "-.025em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif'
    fontSize: "14px"
    lineHeight: 1.5
  lesson:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif'
    fontSize: "13px"
    lineHeight: 1.6
  label:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif'
    fontSize: "10px"
    fontWeight: 500
    letterSpacing: "0"
  evidence:
    fontFamily: "ui-monospace, monospace"
    fontSize: "10px"
rounded:
  evidence: "5px"
  segmented-control: "8px"
  button: "9px"
  toolbar: "10px"
  dock: "14px"
  window: "16px"
spacing:
  compact: "4px"
  dock-gap: "6px"
  dock-inset: "8px"
  action: "10px"
  control: "12px"
  small-window: "16px"
  section: "18px"
  window: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 12px"
  measured-label:
    backgroundColor: "{colors.measured-bg}"
    textColor: "{colors.measured}"
    typography: "{typography.label}"
    rounded: "99px"
    padding: "3px 8px"
  inferred-label:
    backgroundColor: "{colors.inferred-bg}"
    textColor: "{colors.inferred}"
    typography: "{typography.label}"
    rounded: "99px"
    padding: "3px 8px"
  floating-window:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.window}"
    width: "390px"
  dock:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.dock}"
    padding: "8px"
---

# Design System: Pixel Peeper

## Overview

**Creative North Star: "The Floating Study Desk"**

Warm paper, dark ink, and small deliberate accents make a calm place to study the website underneath. Minimal Granola reference imagery informs the restraint; Pixel Peeper uses its own yellow actions and explicit evidence labels. Serif welcome and lesson headings bring an editorial quality, while sans-serif controls keep operation clear.

This records the finished concept at `docs/prototype/index.html`, especially its final CSS override block. It is guidance for new concept screens, not a claim that the existing extension sidepanel has migrated. The Northwind demo website has its own styling and is not the extension's design system. Product behavior and proposed future capabilities belong in `PRODUCT.md` and `docs/design/flow.md`.

**Key Characteristics:**
- Warm paper surfaces and quiet neutral separators.
- Yellow actions, blue selection, teal facts, lavender interpretation.
- Floating surfaces over an unchanged website viewport.
- User-supplied detective artwork in the corner launcher, save feedback, welcome, and brand placements.

## Colors

The frontmatter contains the extracted final palette; names describe its actual uses.

### Primary

Yellow marks the main action and small counts. Its deeper hover value gives a clear response without changing the overall mood. Soft yellow remains a supporting highlight.

### Secondary

Blue identifies hovered or selected website geometry and keyboard focus. Teal and pale teal identify Measured facts. Lavender and pale lavender identify Inferred interpretation. These are functional signals, not interchangeable decoration.

### Neutral

Paper forms the lesson window; the slightly lighter surface forms buttons and dock. Dark ink is the main reading color, muted ink supports secondary information, and the line color separates groups. Evidence chips use their own subdued green pair.

**The Evidence Label Rule.** Pair semantic color with visible Measured or Inferred text; color alone must not carry provenance.

## Typography

Georgia with a serif fallback supplies the welcome heading. The inherited system sans-serif stack supplies controls and reading text; Inter is a fallback name, not a bundled font. Monospace evidence keys stay compact and wrap when needed.

The welcome heading uses the headline token. Lesson paragraphs use the lesson token. Buttons and navigation use compact sans-serif type (12px), measurements use the same size with tabular numbers, and evidence labels use sentence case rather than uppercase. The demo website's large marketing headline does not establish an extension display token.

## Layout

The corner mascot, its intent-opened controls, and movable lesson window float above the website. They do not reserve a side column or reduce the inspected viewport. The default lesson window is right anchored (42px), above the dock (110px), with height capped by the available stage. Its body scrolls independently and uses the window inset token.

Comparison explicitly expands the same window to `min(780px, calc(100% - 84px))`. Activation shows only the peeking mascot at the bottom right (20px right, 12px bottom); its control bar opens alongside it. At the observed 850px breakpoint the window narrows to 350px and moves to a 32px right inset. At 560px, compact and expanded windows share 16px side insets, a bottom offset of 88px, and a smaller content inset; the window fits the available width. At 680px, the mascot shrinks and its wrapping menu opens above it with a viewport-bounded width. These are prototype responsive states, not a mobile extension support promise.

## Elevation & Depth

Soft structural shadows separate floating UI from the website. Window elevation is `0 14px 48px #24242026`; dock elevation is `0 8px 32px #24242026`; selection toolbar elevation is `0 8px 22px #24242020`. Content groups remain flat with thin separators. Selection uses an outline and faint blue fill without a shadow or page dimming.

## Shapes

Rounded containers are gentle and compact: the window has the largest recurring surface radius, the dock sits between window and controls, and buttons stay modestly rounded. Evidence chips are tighter; provenance labels are pill shaped. Lesson groups are open rows with bottom separators rather than nested cards. The welcome art is cropped into a softly rounded square (100px, 24px radius); small brand placements use the same supplied asset.

## Components

Primary buttons pair yellow with dark ink. Secondary buttons pair the light surface with a thin neutral border. Both use compact padding; primary hover deepens yellow, secondary hover warms the surface, and disabled controls halve opacity with an unavailable cursor.

Tabs use a neutral bottom rule, muted inactive labels, and ink for the active label and underline. The Measured and Inferred pills sit beside individual claims. Evidence chips use monospace keys, subdued green, and wrapping; vocabulary chips use lavender and inherited sans-serif text.

The movable lesson window has a brand drag handle, explicit Hide and Close controls, tabs, scrolling body, and action footer. The corner mascot opens a bar containing Pick element, Pick whole page, Saved, and Resume. Pointer departure collapses it after 300ms; keyboard focus keeps it open, and keyboard activation moves focus to Pick element. Outside interaction and Escape dismiss it. The user-supplied `docs/prototype/assets/detective-poses.png` sheet supplies the peeking and getaway poses through CSS background positions (25% 0% and 100% 66.6667%, with a 500% 400% background size). The welcome and small brand placements retain `docs/prototype/assets/detective.png`. Keep artwork out of measurement groups and lesson results.

Selection offers an inline Scan selection action. During simulated asynchronous analysis, a blue beam moves up and down within the selected element or page bounds, accompanied by small pixel marks and a visible status. The beam has an 1100ms cycle; this is not the total analysis duration. The lesson opens on completion. A newer scan or interrupted workflow invalidates the previous run. Reduced-motion mode presents a static centered line, static pixel marks, and the status text.

Saving a new item triggers the getaway pose and “Idea stolen. Source credited. Saved!” for 2800ms. Saving an existing item does not replay the celebration. The desktop save flow and compact menu were inspected in the browser; interruption and keyboard behavior received review fixes.

Focus is a blue outline (3px) offset from the control (3px). Buttons transition background and transform over .15s; reduced-motion mode removes transitions. The mascot lifts over 220ms, the menu fades over 120ms, pixel marks pulse over 1600ms, and the getaway settles over 500ms. Reduced-motion mode also removes these animations and transitions, including the analysis spinner.

## Do's and Don'ts

- **Do** use warm paper and ink as the dominant reading environment.
- **Do** preserve visible evidence labels and compact, wrapping source keys.
- **Do** keep content groups flat and lift the floating UI with structural shadows.
- **Do** preserve the supplied detective illustrations in launcher, save feedback, welcome, and brand placements.
- **Don't** use the demo website's marketing styles as extension tokens.
- **Don't** fill measurements or lesson results with decorative artwork.
- **Don't** imply that this concept has already replaced the production sidepanel.

## Extension scaffold

`apps/extension/components/overlay.ts` and `overlay.css` now implement the floating UI with real `@pixelpeeper/measure` facts, Shadow DOM isolation, extension-icon activation without a sidepanel, persistent `chrome.storage.local` saves, comparison, borrow, and download. The existing palette and prototype identity are preserved. Legacy entrypoints and the sidepanel live in `apps/extension/legacy-sidepanel` and are excluded from the manifest.

`docs/scaffold/index.html` previews the same UI with preview adapters. Screenshot capture, AI interpretation, and page aggregates remain pending; page scope is explicitly labeled as body measurements. This is an implementation scaffold, with 14 tests, typecheck, and build passing and desktop/mobile previews inspected; it does not establish full production readiness.
