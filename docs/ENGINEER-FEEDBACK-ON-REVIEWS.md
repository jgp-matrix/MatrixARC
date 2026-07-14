# ENGINEER FEEDBACK ON REVIEWS

> Feedback from Jon's engineer on the **Review Redlining / drawing-markup** feature, captured 2026-07-14 for later triage/scoping. **Not yet scoped or built** — this is a holding doc. Freddy to allocate B/F/G numbers + route to Coach/Marc when Jon prioritizes.
>
> Source: Jon relaying engineer feedback. One referenced screenshot (item 8) was **not attached** to the message — get it from Jon before implementing item 8.

## Review Redlining / markup items

1. **Move + resize a shape after placing it.** After you place a shape (Rectangle, Circle, Triangle), make it so you can **move it and resize it** after placement. *(enhancement)*

2. **Click a note in the list → highlight its shape.** With multiple notes on one page it's confusing which note goes with which shape. When you click a markup in the **notes list**, highlight the corresponding shape on the drawing. *(enhancement — usability)*

3. **Edit note text after typing.** Make it so you can **edit the text** of a note after you've typed it. *(enhancement — note: addressing this also resolves item 7)*

4. **🐛 Triangle shape doesn't render ON THE DRAWING.** The **Triangle** doesn't show up as a shape on the drawing markup. *(BUG)* — **Clarification from the item-8 screenshot (2026-07-14):** the Triangle DOES appear in the notes list ("△ Triangle — Page 2 INT"), so the entry/type is created fine — the bug is specifically the **on-drawing shape overlay** not rendering the triangle (not the list). Look at the shape-render/draw layer, not the note-list mapping.

5. **Highlighter tool.** Add a **highlighter** tool — easier to mark up specific lines that need to be addressed on the drawings. *(new tool)*

6. **Text markup tool.** Add a markup tool that lets you **add text directly onto the drawings** — e.g. to show part crosses on the drawing. *(new tool)*

7. **Note text should wrap, not scroll.** When typing a note, the text should **wrap to the next line** rather than scrolling horizontally — the scroll makes it hard to proofread the comment before submitting. *(enhancement — becomes moot if item 3 (editable text) is implemented; engineer said to ignore this one if 3 is done)*

8. **Spacing between per-page markup groups (personal preference — optional).** Notes are already separated by page number; add a little **visual space between each page's markup group** in the notes list. Engineer flagged this as a personal preference — implement only if desired. *(cosmetic / optional)*
   - **Screenshot RECEIVED (2026-07-14).** It shows the "MARKUP — ALL PAGES (10)" panel: a **"Page 1"** group (its markup entries `○ Circle — Page 1 · INT`, `□ Rect — Page 1 · INT`, each with a note line below) then a **"Page 2"** group. The ask: increase the vertical gap **between the end of one page's group and the next "Page N" header** so the groups read as clearly separated blocks. (There's a small gap today; engineer wants it a bit bigger.)
   - **NOTE (Freddy):** I can't write the pasted image binary into the repo from a chat paste. If we want the PNG in-repo, Jon drops it at `docs/engineer-feedback-reviews-item8.png`; otherwise this text description is sufficient to implement the spacing.

## Separate area — BOM editing (not markup, but included in the same feedback)

9. **Escape reverts an in-progress part# / quantity edit.** When editing a **part number or quantity**, if you press **Escape** before clicking out of the box or pressing Tab, revert the field back to its previous value.
   - Example: a row is `2907556 CB`; you start typing `2908458 CB`, then press Escape → it reverts to `2907556 CB`.
   - Engineer notes this would mainly help with **part quantities**.
   - *(enhancement — NOTE: an Escape-revert handler already exists for the price field (~`src/app.jsx:27767`, per B031 scoping); this asks to extend that pattern to part# + qty cells. Cross-ref B031.)*

## Triage notes (Freddy)
- Item 4 (Triangle not rendering) is a **bug** — likely the quickest/highest-value fix.
- Items 1, 2, 3, 7 are markup-editing UX (a coherent cluster — "make placed markups editable/interactive").
- Items 5, 6 are new markup tools (highlighter, on-drawing text).
- Item 8 is cosmetic + needs the screenshot.
- Item 9 is a separate BOM-edit concern (extend the existing Escape-revert) — cross-ref B031.
