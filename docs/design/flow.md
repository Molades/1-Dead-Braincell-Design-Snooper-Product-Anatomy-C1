# Pixel Peeper — complete interaction flow

Status: proposed design. Pixel Peeper is a placeholder name. Desktop browser extension first; the prototype illustrates the flow and uses local page measurements with simulated interpretation, not a live AI service.

## The central loop

Open → pick scope → hover → select → review capture → analyze → read lesson → save or compare → choose what to borrow → export direction → pick again.

The webpage viewport never resizes. The extension does not inject layout-affecting styles into the inspected page. All product surfaces float above it, isolated from site styles.

## First entry

Extension activation reveals only a small detective peeping from the bottom-right corner. The original page remains visible. Clicking the mascot expands its compact action bar: Pick element, Pick whole page, Saved, Resume. The welcome explanation is available through Resume before a first analysis, instead of covering the page on activation.

The bar collapses 300ms after the pointer leaves the combined mascot/menu region. Crossing from mascot to controls does not collapse it. Click outside or Esc also collapses it. Keyboard focus keeps controls available until focus leaves; the mascot is a native button with an expanded state, and touch users tap to toggle. Returning users use the same corner launcher. Site permissions and capture transmission explanations remain necessary before actual production analysis; the local prototype transmits nothing.

## Floating surfaces

- Mascot: bottom-right corner, with peeking pose. Desktop hit region 116 × 84 px; narrow layout 88 × 66 px. Dock expands toward the left on desktop and above on narrow screens. No backdrop or webpage resizing.
- Hover: 2 px outline, no page dimming, small name/size label. Only the highlight intercepts inspection interactions; the extension's own surfaces are never selectable.
- Selection: persistent outline, inline toolbar positioned outside the selected bounds. Scan selection, Parent, Child in the prototype; production adds Clear and capture scope details. Flip placement when near viewport edges; clamp within visible bounds.
- Lesson: approximately 380–420 px wide, max height viewport minus 96 px, placed where it covers the least selection area. Draggable, minimizable, closeable. Never claim complete non-obstruction: overlays cover pixels, so provide Hide UI to see the untouched page.
- Comparison/direction: explicitly expanded floating workspace up to 900 px wide. No backdrop; preserve the browser viewport. Restore to compact dock in one action.
- Small viewport: clamp windows to available space; comparison becomes a stacked or A/B toggle view. An extension is desktop-first; mobile layouts are prototype responsiveness, not a promise of mobile-browser support.

Only one primary window opens at a time. Selecting again minimizes the lesson and retains it in session history. Opening the library does not delete current work.

## Pick and confirm

Entering pick mode shows “Hover to preview · Click to select · Esc to exit.” Webpage navigation is suspended only in pick mode. Highlight the actual rendered bounds, clipped to the viewport. Selection supports parent/child navigation with explicit buttons and keyboard alternatives. Show a human name plus HTML/ARIA evidence. Component names from semantic markup are Measured; guessed component roles are Inferred.

Selection shows its boundary, dimensions, and a compact Scan selection toolbar; it does not open the information window. Production adds an optional capture review to this toolbar with scope and crop details. Capture is not sent on hover or selection. Analyze is the transmission action. Capture preview should permit exclusion of sensitive visible information before upload; editing the crop marks it as a custom region and preserves the association to the selected element.

Scope options: Element; containing Component; Visible page; Full page where supported. Visible page must never be called full page. Full-page capture states scroll/stitch limits, lazy-loading effects, sticky duplication, and unavailable content. Changing scope triggers fresh measurement and capture.

## Analysis

The selected bounds show an up/down blue scan line with small pixel marks; no animation runs beyond the selected visible area. A compact nearby status gives the current stage. The lesson window stays hidden until interpretation completes. Reduced motion uses a static line and pixel marks while preserving status updates. Show actual stage status: Reading styles → Capturing selection → Checking supported rules → Interpreting design. Never invent percentage progress or guaranteed timing. Exclude the extension UI from screenshots. Preserve page scroll and selection. User may minimize and keep browsing; analysis continues against the captured snapshot.

Cancel stops further processing where possible. If the service has already received data, cancellation must not imply the upload was undone. Measured facts remain available if interpretation fails. Retry interpretation using the same capture; remeasure only on an explicit Refresh capture action.

## Lesson anatomy

Header: crop thumbnail, source domain, selected object, capture time, and scope.

Lead with one short lesson: “Isolation makes this action easier to notice.” This is labeled Inferred, hedged where appropriate, and linked to measured evidence such as adjacent spacing and contrast. No fabricated attention score.

Use two clear tabs: Lesson and Measurements. Lesson contains role, emphasis, reasoning, limitations, trade-off, and vocabulary. Each claim has its own label; a mixed paragraph is split. Measurements group typography, color, spacing, bounds, shape, layout, structure, supported accessibility checks, repeat counts, and readable states. Expand source evidence with the exact value and the rule version when applicable.

Measured means reproducible for the same captured DOM/state/viewport, not the same forever on a dynamic site. Unknown is a separate availability state, never an AI-filled number. Explain why a value is unavailable and the supported recovery.

Examples:
- Measured: “Text contrast 7.2:1. Passes AA for this text size.” Only for a resolved foreground/background pair.
- Unavailable: “Contrast can't be measured reliably over this image.” AI commentary cannot turn this into a deterministic pass.
- Inferred: “The dark fill likely makes this the primary action.” Evidence: dark fill, surrounding light background, relative area.
- Measured: “Target is 32 × 32 CSS px.” A threshold result names the applicable criterion and exceptions.
- Inferred: “A larger target may reduce pointing effort.” Fitts's law does not supply a universal 44 px pass/fail.

Do not present 44 px as the universal WCAG AA requirement; rules need versioned applicability, exceptions, and distinction between product guidance and conformance. Minimum text size is a product guideline unless a named standard supports the check. Heading order is observed structure, with a separate contextual interpretation. A matching style fingerprint count is measured; membership in an intended design system is inferred. Multiples-of-8 counts are measured; a claimed spacing-system intent is inferred. Page type and revenue model are inferred unless literally identified by the page, and evidence still matters.

Page analysis adds aggregate palette/type/spacing values, component inventory with classification provenance, heading tree, supported deterministic checks, 3–5 lessons, and explicitly inferred design language/strategy. Nielsen heuristics require page/task context; unavailable interaction paths cannot receive conformance claims.

Footer actions: Save lesson, Add to compare, Export, Pick another. Save is idempotent. On a new save, switch the corner mascot to its getaway pose for 2.8 seconds with “Idea stolen. Source credited. Saved!”; then return to peeking. Repeated saves say Already saved and do not replay the celebration. Show Saved with Undo where appropriate. First save offers a collection name without requiring organization. Keep quick-save as the default.

## Library and comparison

Library is an on-page floating window. Search source/title/vocabulary, filter element/page, and show crop, title, source, and time. Unsaved recent lessons are distinct from saved items. Local persistence can work without an account; cloud sync is a separate capability.

Compare 2–3 items of a compatible scope. Allow selection from current analysis or library, including other pages captured previously. The dock shows A, B, C and count. A fourth item prompts replacement, never silently removes one. Mixed scopes explain limits rather than pretending values are comparable.

Comparison: visual crops first; differences in typography, color, spacing, shape, and layout below. Every actual value is Measured with its source. “Why these feel different” is Inferred and connects to exact differences. Missing measurements stay unavailable. No universal winner.

“What to borrow” chooses a source by category. Offer Keep mine/omit rather than forcing every token. A user-written intent is User authored, not falsely Measured or AI Inferred. Preserve source links and date. If a picked value requires adaptation, the proposal is Inferred until the user accepts it; acceptance is a user decision, not a measurement.

## Design direction and export

Direction preview shows chosen tokens, a plain-language rationale, and unresolved conflicts. Combining text and background from separate sources requires recalculating contrast; do not carry the original source's pass result into a new pairing. Export actions: DESIGN.md, tokens.json, CSS variables; Copy or Download.

DESIGN.md separates Measured source values, Inferred recommendations, and User authored decisions. tokens.json stores measured values separately from interpretation metadata, with provenance in extensions. CSS exports actual declarations only; inferred guidance and origin belong in comments or a companion document. Never turn prose into an executable CSS value.

Successful export offers “Pick another element” and “Keep building this direction.” Retain comparison and collection. The repeat loop returns to the corner mascot with no welcome replay. First welcome remains accessible under Help.

## Recovery and edge states

- Restricted browser page: explain that inspection is unavailable; return to a regular webpage.
- Cross-origin frame/closed shadow tree: show unsupported boundary; do not fabricate child measurements.
- Element disappears or page navigates: retain captured lesson, mark original selection unavailable, offer Pick again.
- Responsive changes/scroll: update highlight geometry; measurements only refresh explicitly once captured.
- Offscreen selection: hide detached toolbar and offer Scroll to selection if the original exists.
- Network/model failure: keep facts and crop, Retry interpretation, Export facts.
- Capture failure: explain cause; Retry capture; no silent screenshot substitution.
- Save failure: retain lesson and draft; retry or export.
- Empty library: “Your first lesson starts with a selection,” with Pick an element.
- Slow analysis: current stage plus minimize/cancel; no repeating mascot animation needed.

## Visual direction

Warm paper, dark ink, thin neutral separators, restrained soft elevation, yellow primary accents, blue selection outline, teal Measured, lavender Inferred. Pair label text with color. Serif lesson/welcome headings and readable sans-serif controls. Detective illustration only at welcome/empty states; avoid artwork inside measurement tables and results. Vibrancy comes from a few deliberate accents, not a multicolor dashboard.

## Implementation acceptance

No viewport resizing; extension UI excluded from capture and measurement; hover makes no network request; explicit analyze action; every claim's provenance; missing data stays missing; keyboard pick/escape/focus restoration; drag alternatives; persistent drafts; export provenance; 2–3 item limits; regression checks for selection anchoring, navigation, snapshot freshness, and overlay isolation.
