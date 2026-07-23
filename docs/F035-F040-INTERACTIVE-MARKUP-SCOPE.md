# F035 (move + resize shapes) + F040 (movable shape-notes with leader) — Coach build-ready plan

**Coach 2026-07-22 · read-only · Drawing Review modal (`showDrawingReview` portal, `src/app.jsx` :30990–:31335). Add-only, Data-Retention-safe, no migration. Ready to build next session — resolve the 6 open decisions at kickoff.**

## Current state
- **Shapes** = `pg.reviewShapes[]`, 0–100 % coords, rendered in the B051 unit-viewBox SVG (`viewBox="0 0 100 100" preserveAspectRatio="none"`, `pointerEvents:none`, zIndex 6, :31092). Types: `line` (`points:[{x,y}]` or legacy `x1,y1,x2,y2`), `circle` (`cx,cy,r`), `rect` (`x1,y1,x2,y2`), `triangle` (`x1,y1,x2,y2`, apex=`((x1+x2)/2,y1)`). Shape fields (:31131): `id,note,color,strokeWidth,author,isCustomer,createdAt,visibility`.
- **Note-drag precedent (THE pattern to mirror, :31033–:31045):** notes = standalone `pg.reviewNotes[]` HTML divs (zIndex 10) with own `x,y`; a `⠿` handle `onMouseDown` captures the wrapper rect, mutates `el.style.left/top` directly during `mousemove` (no per-move re-render), clamps `[0,90]`, persists on `mouseup` via `saveNotes→onUpdate+onSaveImmediate`.
- **Shape-notes today:** stored ON the shape as `shape.note` (string, set once at creation :31131), rendered ONLY in the sidebar MARKUP list (:31312) — never on the drawing. No position, no separate entity, no shape→note link. **Key simplifier for F040.**
- **Why shapes are inert:** SVG zIndex 6 `pointerEvents:none`; drawing/placement overlay div zIndex 5 (mounted only when `!readOnly&&!newNotePos&&!newShapeData`, :31151); notes zIndex 10 (already interactive). Markup state :24966–24986 (`markupTool`, `drawingShape`, `newShapeData`, `polylinePoints`, `newNotePos`, `editingNoteId`; unused `draggingNote`).
- **Save/Data-Retention:** shapes/notes persist wholesale via `onUpdate`+`onSaveImmediate`→`saveProjectPanel`/`saveProject`; guards (:9297/:9707) preserve arrays; every update spreads the object → no field drop. Add-only is safe, no migration.

## Interaction model (recommended)
Keep `<svg pointerEvents:none>` but set `pointerEvents:"stroke"` + `cursor:grab` + a move-drag handler on **each individual shape element ONLY when `markupTool==="select"`** (a new Select/Move `↖` tool in the toolbar array :31001). SVG (z6) is above the drawing overlay (z5): a click on a shape hits the shape; empty-space clicks pass through to the overlay → new-shape drawing untouched. In every other mode, shapes stay `pointerEvents:none` (today's behavior exactly). Shape-note labels (F040) = HTML divs at zIndex 10 with a `⠿` handle, always interactive like notes.

## Data model (add-only)
- **F035 move — no new fields.** Translate existing coords by drag delta in 0–100: line/points `{x+dx,y+dy}`; circle `cx+dx,cy+dy` (r unchanged); rect/triangle `x1,x2+dx / y1,y2+dy`. **Clamp the delta by the shape's BBox** (not per-coord — that distorts). Persist via the note save path.
- **F040 — add only `noteX`,`noteY`** (0–100, label box position) to the shape object. NO shapeId/separate entity (note already on shape). Legacy shapes with a non-empty `note` but no `noteX/noteY` → default at render to `centroid + (+8% x, −6% y)` clamped `[0,90]`. Leader anchor is DERIVED (centroid), not stored.
- **F035 resize (deferred slice) — no new stored fields** (edit corners / `r` / per-point); non-uniform viewBox makes circle `r` visually ambiguous → bbox model or defer.

## Leader line
SVG `<line>` inside the shapes SVG (z6, under the z10 label, blocks nothing), one per shape with non-empty `note`. Shape anchor = derived centroid (rect/triangle bbox center; circle `cx,cy`; line avg of points). Label anchor = label center `(noteX,noteY)` for v1. Live-track during drag by mutating the line's x2/y2 via a ref in `onMove` (same direct-DOM trick, no re-render).

## Build split (recommended order)
1. **F035-move** (S–M) — Select tool + per-shape pointerEvents gate + move-drag (translate + bbox-clamp) + persist. **Smallest shippable slice, matches Jon's stated need ("move them after placing"). Ship first.**
2. **F040** (M) — render shape-note labels on the overlay (movable divs mirroring notes) + `noteX/noteY` + leader + legacy default. Shares plumbing with F035-move → build together or immediately after (can be one PR).
3. **F035-resize** (L) — per-type handles + non-uniform-scale handling. Fast-follow, not required by Jon's stated need.

## Open decisions for Jon (resolve at build kickoff)
1. Select-mode vs always-draggable → **rec: explicit Select/Move `↖` tool** (avoids ambiguity with note-placement in the null state).
2. Resize now or fast-follow → **rec: fast-follow** (move satisfies the need; resize is L + circle-r wrinkle).
3. Leader anchor → **rec: derived centroid.**
4. Legacy label default offset → **rec: centroid +8%x −6%y clamped.**
5. Leader during drag → **rec: live-track via SVG line ref.**
6. Labels for empty-note shapes / "+ add note" affordance → **rec: no** (that's F036 territory; F040 renders labels only for non-empty `shape.note`).

## SSOT / Data-Retention
- Add-only confirmed (F040 = `noteX/noteY`; F035-move mutates existing coords). No rename/remove, legacy renders via computed defaults, no migration. Merge guards + dataUrl-strip unaffected.
- **Factor shared helpers — one definition each, reused by move + leader-anchor + (later) resize:** `_shapeCentroid(shp)`, `_shapeBBox(shp)`, `_translateShape(shp,dx,dy)`, and a shared `makeDragHandler({onCommit})` factored from the note-drag template (:31033–:31045) rather than copy-pasting a third time.

Key file:lines: overlay SVG :31092 · shape render :31093-31101 · `shape.note` creation :31131 · note-drag :31033-31045 · note schema :31082 · drawing overlay :31151-31204 · sidebar shape list :31294-31322 · markup state :24981-24986 · save guards :9297/:9707.
