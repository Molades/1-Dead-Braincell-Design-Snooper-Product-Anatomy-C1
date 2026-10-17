---
name: Pixel Peeper
description: A quiet, precise inspector that floats over any website. Linear's system, light.
source: "Adapted from the Linear DESIGN.md in VoltAgent/awesome-design-md (MIT). Light variant, Pixel Peeper semantics added."
colors:
  canvas: "#f7f8f8"
  surface: "#ffffff"
  surface-sunk: "#f2f3f5"
  hover: "#f2f3f5"
  ink: "#1b1c1f"
  ink-2: "#3c3f44"
  muted: "#6b6f76"
  subtle: "#8a8f98"
  hairline: "#e6e7ea"
  hairline-strong: "#d5d7dc"
  primary: "#5e6ad2"
  primary-hover: "#4e5ac4"
  primary-soft: "#eef0fc"
  on-primary: "#ffffff"
  selection: "#5e6ad2"
  measured: "#17804a"
  measured-bg: "#e6f5ec"
  inferred: "#9a5408"
  inferred-bg: "#fdf1e2"
  fail: "#c0362c"
  fail-bg: "#fdeceb"
  mascot-yellow: "#f5c84c"
typography:
  display:
    fontFamily: Schibsted Grotesk
    fontSize: "48px"
    fontWeight: 700
    lineHeight: 1.0
    letterSpacing: "-0.04em"
  title:
    fontFamily: Schibsted Grotesk
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  lesson-headline:
    fontFamily: Schibsted Grotesk
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "-0.015em"
  body:
    fontFamily: Roboto
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Roboto
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "-0.01em"
  value:
    fontFamily: JetBrains Mono
    fontSize: "12px"
    fontWeight: 500
    fontFeature: tabular-nums
rounded:
  tag: "4px"
  chip: "6px"
  button: "8px"
  control: "10px"
  card: "12px"
  window: "20px"
  pill: "99px"
  smoothing: "100% (iOS squircle; CSS corner-shape)"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.button}"
  button-quiet:
    backgroundColor: transparent
    textColor: "{colors.ink-2}"
    rounded: "{rounded.button}"
  measured-label:
    backgroundColor: "{colors.measured-bg}"
    textColor: "{colors.measured}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
  inferred-label:
    backgroundColor: "{colors.inferred-bg}"
    textColor: "{colors.inferred}"
    typography: "{typography.label}"
    rounded: "{rounded.chip}"
  floating-window:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.window}"
    width: "390px"
---

# Design System: Pixel Peeper

## Overview

**North star: "The quiet inspector."** Pixel Peeper floats over someone else's website, so it must be calm, precise and unmistakably separate from the page underneath. The system is adapted from Linear's DESIGN.md (VoltAgent/awesome-design-md, MIT) and flipped to light: cool neutrals, hairlines, one lavender-blue accent, and no decoration that competes with the website being studied.

Personality comes from one place only: the detective. Everything else stays out of the way so a lesson can be read in under a minute.

**Key characteristics**
- White sheets on a cool off-white canvas; depth from shadow borders, not solid lines.
- One accent, `primary` indigo, for every action and for the selection outline on the page.
- Two meaning colours that the whole product rests on: green **Measured**, amber **Inferred**. Always paired with the word.
- Inter for all interface text, JetBrains Mono for measured values.
- The detective (black, white, mascot yellow) is the only playful element.

## Colors

- **Primary (indigo):** the main action on each surface, the selection outline and tag, focus rings, progress. One primary button per view.
- **Neutrals:** `ink` for reading, `ink-2` for secondary text and quiet buttons, `muted` and `subtle` for metadata and labels, `hairline` for separators.
- **Measured (green):** facts read from the page by code.
- **Inferred (amber):** the AI's interpretation. Amber was chosen so it can never be confused with the indigo actions.
- **Fail (red):** failing rules and errors only.
- **Mascot yellow:** the detective's eyes and celebration pixels. Never a button.

**The Evidence Label Rule.** Colour never carries provenance alone: every Measured or Inferred claim shows the word.

## Typography

Inter (bundled, SIL OFL) for everything; Linear's own face is not distributed and its DESIGN.md names Inter as the closest free substitute. JetBrains Mono (bundled, SIL OFL) for measured values, tags and code. Headings are semibold with tight tracking; body text stays at 13.5 to 15px. Labels are 11px semibold with slight positive tracking.

The in-page overlay registers the same files under private names ("PP Inter", "PP Mono") so a website that names Inter in its own CSS keeps rendering exactly as before.

## Layout

The overlay never reserves width: the detective, toolbar and lesson window float above the page. The lesson window is 390px wide and movable. Library and onboarding use a centred column with a 16px minimum gutter and are checked at 1440px and 375px.

## Elevation & Depth

Floating objects use a shadow border plus a soft lift: `0 0 0 1px rgb(15 16 18 / .07), 0 1px 2px rgb(15 16 18 / .05), 0 16px 40px -12px rgb(15 16 18 / .22)`. Content inside a sheet stays flat, separated by hairlines or a sunk surface with a 1px ring.

## Shapes

Chips 6px, buttons 8px, cards 12px, the lesson window 14px, pills only for status counts and the onboarding progress.

## Components

- **Buttons:** primary indigo with white text and a faint inner highlight; quiet buttons are text on transparent with a hover fill. Every pressable element scales to .97 on press.
- **Lesson window:** header with the detective mark and Hide; title, metadata, tabs with a settling underline; footer with quiet actions left and the one primary action right.
- **Rules list:** a coloured dot and status word, not a stretched pill. Summary counts keep compact chips.
- **Measurements:** label and value grid; colours shown as `#RRGGBB` with a swatch, opacity as a percentage when not solid.
- **Selection on the page:** 1.5px indigo outline, soft ring, mono tag with tabular numerals.

## Motion

Following Emil Kowalski's design engineering rules (emilkowalski/skills, `emil-design-eng`):

- Enter and exit use ease-out `cubic-bezier(.23, 1, .32, 1)`; movement on screen uses ease-in-out `cubic-bezier(.77, 0, .175, 1)`. Never ease-in.
- Interface animations stay under 300ms: presses 150ms, popovers and dock 200ms, the lesson window 220ms. Exits are quicker than entrances.
- Nothing appears from `scale(0)`; popovers start at `scale(.97)` from their trigger's corner.
- Hover effects are gated to `(hover: hover) and (pointer: fine)`.
- Keyboard-triggered actions are not animated.
- Onboarding is rare and first-time, so it may delight: a product demo, staggered arrivals, one damped spring for the detective, a pixel burst on Done.
- Reduced motion removes movement and loops but keeps opacity and colour changes so state stays visible.

## The detective (character)

Built in `apps/extension/components/mascot.ts`, voice in `sound.ts`. He is the only playful element, so he gets the motion budget the rest of the interface does not.

| Moment | Pose | Motion | Sound |
|---|---|---|---|
| Switched on | peek | pops up from behind his ledge (spring) | pop, only if sound is unlocked |
| Resting | peek, live eyes | breathes, blinks every 2.4 to 6s (sometimes twice), pupils follow the cursor | none |
| Hover | peek | leans up, eyes widen | none |
| Click | any | squash and settle | pop (open) or tick (close menu) |
| Poked 5 times in 1.6s | peek | dizzy wobble, pupils roll, "Hey! That tickles." | boing |
| Picking | magnifying glass | slow sway | none (frequent) |
| Scanning | laptop | typing wiggle | none |
| Lesson ready | lightbulb, 2.4s | hop | ding |
| Error | head scratch, 3.2s | head tilt | bonk |
| Idea saved | running with the file, 2.4s | dash in | coin |
| No activity for 60s | asleep, zzz | slow breathing | none |
| Woken by movement | peek | startle hop, "Oh! I'm up." | none |
| Page scrolls | peek | ducks behind the ledge, returns 380ms after scrolling stops | none |
| Close | box | hops into his box and fades | whoosh |

**Sound rules.** Synthesised with Web Audio (no files). Silent until the person presses something of ours on the page; only pointer-caused (keyboard repeats stay silent); never while the tab is hidden; one cue per 90ms; quiet master gain; one mute switch in the menu, remembered.

**Edge cases.** Eye loop runs only while the cursor moves and stops itself; all loops pause when the tab is hidden; hidden during fullscreen video and print; a thin light rim keeps him readable on dark sites; the saved-ideas badge hides while he ducks, sleeps or leaves; a newer mood always interrupts an older one; reduced motion keeps the pose changes and drops every movement.

## Do's and Don'ts

- **Do** keep one primary action per view, in indigo.
- **Do** show Measured and Inferred as words, in green and amber.
- **Do** use shadow borders on floating surfaces.
- **Do** keep the detective in the launcher, onboarding, save moment and empty states.
- **Don't** use yellow for buttons; it belongs to the mascot.
- **Don't** put artwork inside measurements or lesson results.
- **Don't** let any overlay style or font leak into the inspected website.

## Visual language v2 (from Figma, "Lesson window" frames)

The approved Lesson, Rules and Measurements frames (Figma file `1LeW6xrkcWExXaHIwbU4qf`, section "Section 2147263056") are the reference for every surface. These rules are the contract; when in doubt, match the frames.

**Type.** Three faces, each with one job. All bundled (SIL OFL) and registered in the page under private names so a website's own fonts are never touched.

| Role | Face | Sizes | Tracking |
|---|---|---|---|
| Display, titles, section heads, buttons | Schibsted Grotesk 600/700 | 48, 32, 22, 19, 15, 14 | -4% at 48, -3% at 32, -2% at 20 to 24, -1.5% at 17 to 19, -1% at 14 to 15 |
| Reading text, labels, tabs | Roboto 400/500/600 | 17, 14, 13, 12, 11 | 0, labels -1% |
| Measured values, element tags, code | JetBrains Mono 400/700, tabular figures | 12, 11, 10 | 0 |

Mono is only for things that were measured or are code; it is never decoration.

**Surfaces and gradients.** Gradients are vertical, quiet and always light-to-slightly-darker, so a surface reads as gently raised. Every raised surface also gets a 1px white inner highlight on its top edge.

| Recipe | From → To | Edge |
|---|---|---|
| Window | `#ffffff` → `#fbfbfd` | hairline + layered lift |
| Selection band | `#f5f6ff` → `#ffffff` | none |
| Capture stage | `#f5f6f9` → `#eceef3` + dot grid + indigo glow behind the selection | hairline |
| Neutral control (chip, tab pill, quiet button) | `#ffffff` → `#f8f9fa` | hairline |
| Measured tint | `#f0faf4` → `#dff2e6` | `#93c6ab` |
| Inferred tint | `#fff7ec` → `#fbe8cf` | `#d5b28b` |
| Indigo tint (icon tile) | `#f5f6ff` → `#e3e6fb` | `#cfd4f6` |
| Primary button | `#7884e6` → `#5f6bd3` (55%) → `#525dc6` | `#4a55bd`, white top highlight, indigo glow shadow |

**Tags.** 6px radius, 3/8 padding, a tint fill with a 1px tinted outline, Roboto Medium 12 at -1%, optional 12px icon. Measured is green with a shield icon, Inferred is amber with a sparkle icon. Amber means Inferred and nothing else; "watch out" uses the fail red.

**Evidence chips.** White to faint gray, hairline, 6px radius: a green dot (measured), the label in Roboto 12 muted, the value in JetBrains Mono Bold 12.

**Icons.** Phosphor Duotone only (`components/icons.ts`), 12/14/16/20px, drawn in currentColor with the second tone at 20%. Section icons sit in 28px tiles with a tinted gradient. No unicode glyphs or emoji as icons.

**Corners.** Radii 4 (small tags), 6 (tags, chips), 8 (buttons, tiles), 10 (segmented track, primary button), 12 (cards, stage), 20 (window). Every rounded corner is a continuous (iOS, 100% smoothing) curve: `corner-shape: superellipse(1.6)` where the browser supports it, with the radius scaled up so the visual size matches Figma. True circles (dots, eyes, avatars) stay round.

**Spacing.** 4px grid: 4, 6, 8, 10, 12, 16, 20, 24, 32. Window gutter 16. More space above a heading than below it.

**Depth.** Shadows always have an offset and a soft blur. The window: `0 0 0 1px` hairline, `0 1px 2px`, `0 24px 48px -12px`, plus a faint white outer ring so it stays separate on dark websites.

**Interaction.** Every control has hover (pointer devices only), pressed (`scale(.97)`), focus-visible (2px indigo ring, 2px offset) and disabled states. Ease-out `cubic-bezier(.23,1,.32,1)` for enter/exit, under 300ms for chrome; the spring only for the detective and the selection lock.

**The pick.** The outline is the product's signature: it glides between elements, takes the element's own corner radius, shows the element's padding as a fine indigo hatch, carries a mono size tag, and on click it locks with a pulse, corner handles and a soft spotlight that dims the rest of the page.

**Sound.** Synthesised, quiet, caused by the person. The onboarding has its own short generative score (soft pad and plucks), with one visible switch to turn it off.
