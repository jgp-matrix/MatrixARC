# Spec — "Print Traveler" button (internal Quoted-BOM print, no email)

**Status:** SPEC ONLY — build deferred until after #163 ships (Jon's call, 2026-06-27).
**Author:** Marc (CCD) | **Grounded against:** `src/app.jsx` @ branch `feat/163-surrogate-key` (`27bf12d4`)
**Owner when built:** CCD implements; small enough to skip H-item plan/Coach gate (single self-contained UI add reusing an existing generator) — confirm with Jon at build time.

---

## Goal
A project-level button that generates the **Quoted BOM / Traveler PDF** for **internal** use (preview + print) **without sending any email**. Must support printing **one specific Line (panel)** OR the **entire project package** (all Travelers in one PDF).

Today the Traveler is only producible as an *email attachment* (Path A "Send Quoted BOM for Approval", Path B "Include Quoted BOM" checkbox in Send/Print Quote). There is no internal preview/print path — this fills that gap.

## Reuse — the generator already exists
`generateTravelerBomPdf(project)` (`src/app.jsx:7636`, also `window._generateTravelerBomPdf`):
- Render-on-demand, no stored artifact. Returns `{pdfBase64, pdfFilename}`.
- Iterates **all** `project.panels`, one `buildCoverPage` per panel, into one combined landscape PDF.
- Reads `project.panels / bcProjectNumber / quote / quoteRev / name / bcCustomerName`.

**Key insight — single-line needs NO generator change:** call it with a project whose `panels` is filtered to the one chosen panel:
```js
const onePanel = project.panels[idx];
const trav = await generateTravelerBomPdf({ ...project, panels: [onePanel] });
```
- **Entire project package** = call it as-is (`generateTravelerBomPdf(project)`) — existing behavior.
- **Specific Line** = `generateTravelerBomPdf({ ...project, panels: [onePanel] })`.

(Optional polish: tweak the filename for the single-line case to include the line/drawing no., e.g. `…- Line N.pdf`. Generator currently derives filename from project; for single-line, override `pdfFilename` after the call or pass an opts override.)

## Output behavior — print, not email
"Print Traveler" → preview + print, no send. Recommended implementation:
```js
const { pdfBase64, pdfFilename } = trav;
const blob = b64toBlob(pdfBase64, "application/pdf");   // small helper: atob → Uint8Array → Blob
const url = URL.createObjectURL(blob);
window.open(url, "_blank");   // opens in a new tab; user prints via Ctrl+P
// (revoke the objectURL on a timeout or tab close)
```
- New-tab preview is printable and needs no extra UI. A "Download" affordance can be added later if wanted (anchor with `download={pdfFilename}`).
- No BC calls, no email, no Firestore writes. Pure client render of in-memory `project`.

## UI — button placement (exact)
ProjectView action button row, **between Transfer and Delete** (`src/app.jsx:34644–34648`):
```jsx
{!readOnly&&onTransfer&&(
  <button onClick={onTransfer} style={…}>⇄ Transfer</button>
)}
{/* NEW — Print Traveler */}
<button onClick={()=>setShowPrintTraveler(true)} style={btn(C.accentDim,C.accent,{border:`1px solid ${C.accent}`,fontSize:13,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase"})}>🖨 Print Traveler</button>
{!readOnly&&onDelete&&(
  <button onClick={…}>🗑 Delete</button>
)}
```
- Visible regardless of `readOnly` (it's a read/print action — confirm with Jon whether viewers should print; default: allow).
- Use the same `btn(...)` style helper as the neighbors for visual consistency.

## UI — the modal (Line vs Project package)
New `showPrintTraveler` state in ProjectView. On open, modal asks:

> **Print Traveler** — *Which BOM(s)?*
> - ◉ **Entire Project package** — all Lines' Travelers in one PDF (default)
> - ○ **Specific Line:** [dropdown of panels → "Line N — {drawingNo or panel name}"]
>
> [Cancel] [Print]

- Panel list source: `project.panels.map((p,i)=>({idx:i, label:\`Line ${i+1}${p.drawingNo?` — ${p.drawingNo}`:''}\`}))` — mirror how Lines are labeled in QUOTE SUMMARY.
- On **Print**: build the project arg per the choice (above), call `generateTravelerBomPdf`, open the blob in a new tab, close the modal.
- Disable Print if the chosen scope has no panels.

## Edge cases
- **No panels:** generator returns `null` → show `arcAlert("No panels — nothing to print.")` (mirror existing 33284 guard). Disable/guard the Print button.
- **Single-panel project:** the "Specific Line" option still works; "Entire Project" == that one line. Both fine.
- **Large projects:** combined PDF can be many pages — acceptable (same as the email path). New-tab open handles it.
- **objectURL leak:** `URL.revokeObjectURL(url)` after a short delay or on unload.

## What this does NOT touch
No generator logic change (only a filtered `project` arg), no BC, no email, no Firestore, no #163 surrogate code. Independent of PR #1.

## Estimated size
~1 small helper (`b64toBlob`), 1 button (~3 lines), 1 modal component (~40 lines), 1 state + handler (~15 lines). ~60 lines, LOW risk.

## Test notes (when built)
- Specific Line → PDF has exactly that panel's cover page; PN column shows full PN (verifies alongside #163 T2).
- Entire Project → one PDF, page count == panel count, in panel order.
- No email sent (confirm no Graph/send call fires), no BC call (confirm network).
- Filename sane for both modes.
