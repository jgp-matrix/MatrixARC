# Engineer review-markup feedback — triage + B/F/G assignments

**Coach triage 2026-07-22 (read-only, code-grounded) · Freddy stamped numbers. Source: `docs/ENGINEER-FEEDBACK-ON-REVIEWS.md`. No existing tracker dups (F017/F018/B027 = tech-review per-row notes; B031 = price-clear guard — different subsystems). Items 1–8 live in the Drawing Review modal (`src/app.jsx` `showDrawingReview` portal ~:30922–:31268); the Escape item is BOM-cell. `reviewNotes`/`reviewShapes` are already Data-Retention merge-guarded (~:9282/:9689) → items riding those arrays are data-safe.**

## Ranked, numbered

### B051 — "Triangle (& multi-point line) markup doesn't render on the drawing overlay" — HIGH · S
Root cause CONFIRMED: overlay SVG (`:31025`) has no `viewBox`; the triangle `<polygon points="…%">` (`:31032`) and the multi-point `<polyline points="…%">` (`:31028`, rubber-band `:31039/:31047`) use **percentages in `points`**, which SVG does not allow (points is a plain-number list) → never paints. Record IS created (shows in MARKUP list `:31232` with △ icon) — matches "appears in list, not on drawing." **Fix:** `viewBox="0 0 100 100" preserveAspectRatio="none"` on the overlay SVG + drop `%` on children (become 0–100 user units). One change fixes triangle + multi-segment lines. **Standalone quick win; land FIRST — items F034–F038 build on the fixed overlay.**

### F034 — "Click a markup in the list → highlight its shape on the drawing" — MED-HIGH · M
MARKUP-list onClick (`:31233`) + notes-list (`:31150`) only `setReviewPageIdx` (page jump), no highlight. Add `selectedShapeId`/`selectedNoteId` → pulse/flash the matching overlay element (`:31026` shapes, `:30960` note pins).

### F035 — "Move + resize a placed markup shape" — MED-HIGH · L
Shapes render in a `pointerEvents:none` SVG (`:31025`) — only NOTES drag today (`:30966`). New: drag + per-type resize handles (rect corners / circle radius / triangle verts / line endpoints). Highest user value, biggest build. Rides merge-guarded `reviewShapes` (keep new props on that array — no parallel storage).

### F036 — "Edit a markup's note text after placing (shape-notes) + wrap-not-scroll" — MED · S–M · ⚠ VERIFY-FIRST
Note-PIN text is already click-to-edit (`:30988`→`editingNoteId` `:30980`; sidebar `sidebarEditNoteId`/`sidebarEditDetailId`) — likely shipped since the 2026-07-14 feedback → may be a no-op for pins. GENUINELY missing: SHAPE-notes (note on a rect/circle/triangle) are one-shot at creation (`:31073`); MARKUP list only displays `s.note` (`:31245`), no edit path. Folds in the original "wrap not scroll" ask: the note inputs are single-line `<input>` (`:31021`/`:30986`) that scroll horizontally → switch to `<textarea>` (wrap) satisfies both. **Needs Jon/engineer confirm: which "note" — pin (maybe done) or shape-note (missing)?**

### F037 — "Highlighter markup tool" — MED · M
New entry in `markupTool` set (`:24914`) + toolbar (`:30934`) + semi-transparent thick stroke in the overlay. Straightforward once B051's viewBox lands.

### F038 — "Free-text markup (plain text labels directly on the drawing)" — LOW-MED · M · ⚠ PRODUCT DECISION
Note pins already place text (numbered # bubbles, INT/EXT). Engineer wants plain labels (e.g. part crosses) without the #/chrome. **Jon call:** distinct `type:"text"` shape vs a note-style variant? Scope depends on answer.

### F039 — "Escape reverts an in-progress part#/qty BOM-cell edit" — MED · S · (BOM-edit, not markup) · cross-ref B031 (distinct)
Gap CONFIRMED: the generic BOM cell `<input>` (part#/description/qty — `f`-loop `:30494–:30539`) has `onBlur`/`onFocus` but **no `onKeyDown`** → Escape doesn't revert. The PRICE cell already does exactly this (`:30558`: `if(e.key==="Escape"){revert;blur;}`). Mirror it onto part#/qty. NOT money-path (discards uncommitted edit only). NOT a B031 dup (B031 = guarding a price CLEAR).

### G014 — "Vertical spacing between per-page markup groups in the MARKUP list" — LOW · S · (cosmetic, engineer preference)
Current MARKUP list (`:31232`) is FLAT (flatMap, no `Page N` headers); the requested "space between page groups" implies FIRST adding per-page group structure, then spacing — slightly more than a margin bump.

## Build clustering (Freddy)
- **B051 first** (standalone quick win, unblocks the overlay for F034/F035/F037/F038).
- Then a **markup interactive mini-epic (F034 + F035 + F036)** — same overlay/sidebar.
- Then **new tools (F037 + F038)**.
- **F039** routes independently (BOM-edit, small). **G014** cosmetic, low.

## Needs a Jon decision before building
- **F036** — pin-editing (maybe already shipped) vs shape-note editing? Verify + confirm.
- **F038** — distinct text tool vs note-style variant (product call).
