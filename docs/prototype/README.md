# Pixel Peeper flow prototype

Open index.html in a browser, or use the local preview. The top navigation jumps between demo states; it is prototype navigation, not the shipped extension toolbar.

Activation starts with the corner mascot only. Click it to reveal controls; leaving the controls tucks them away. Scan animates within the selection, then opens the lesson. Saving a new item changes the mascot to its getaway pose.

Try: mascot → Pick element → click a button/card → Analyze selection → Lesson/Measurements → Save to library → Pick another → Save → Library → select 2–3 references → Compare → choose source per category → preview DESIGN.md/tokens.json/CSS → Download → Pick element again.

Analyze page selects the entire local demo page, with measured aggregate styles and simulated page lessons. Hide keeps analysis running without the lesson window. Resume restores the captured result. Selection changes invalidate earlier demo analysis.

## Scope

Implemented concept: floating windows, current demo DOM styles, selection outlines, parent/child selection, stage simulation, measured/inferred labels, session library, 2–3 reference comparison, category borrowing, export preview/copy/download, and responsive layout.

Simulated or specification-only: actual screenshot/crop capture, arbitrary websites, AI, account/cloud sync, persistent library after reload, cross-page capture, collection management, full rule coverage, interaction-state capture, sensitive crop exclusion, retry/error UI. Schematic thumbnails are labeled and are not screenshots. Full flow and production acceptance criteria: ../design/flow.md.

The production extension's current sidepanel implementation is unchanged. This prototype defines the proposed replacement experience.

## Verification

Script syntax checked. Desktop comparison and 390px welcome inspected. Browser checked save, borrowing-to-export value updates, page selection, hide-through-analysis, and stale-run invalidation. Download action showed its success state; the browser automation download-event hook did not resolve, so disk receipt is not independently verified. A separate finish review's two interaction findings were corrected and scored resolved.

## Asset provenance

assets/detective.png is copied unchanged from the user-supplied detective reference, codex-clipboard-846f2fae-a67c-4c0f-957d-2ae4e039f2ac.png. This is a supplied concept asset; licensing for production is an open decision.

The mascot poses use the unchanged user-supplied illustration sheet in assets/detective-poses.png, rendered with CSS sprite positions. Reduced-motion mode preserves scan status and save confirmation without animated travel.
