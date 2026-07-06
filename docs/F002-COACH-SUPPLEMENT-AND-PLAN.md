# F002 — BOM Column Reorg / Indicator Cleanup — COACH SUPPLEMENT + DETAILED PLAN

**Author:** Sam Wize (Coach)
**Date:** 2026-07-06
**For:** Freddy (Analyst Review) → Jon (Plan approval) → Marc (build)
**Traced against tip:** `ede88d59` (v1.21.25). All line numbers are at this tip; expect ±small drift.
**Status:** Trace + Plan complete. **HOLD after Plan per per-phase gating — no build until Jon's go.**

---

## 0. Executive summary — READ THIS FIRST

The five changes are all achievable and low-risk. **But the Brief's column model is wrong in two material ways, and C1 is a 3-badge problem, not a 2-badge merge.** These must be resolved (Jon decision) before Marc builds. Nothing here is a blocker — they're scope clarifications.

**Three material divergences from the Brief:**

| Brief assumed | Reality (verified in code) |
|---|---|
| There is a **"BC / ARC-AI" marker column** between Supplier and Unit $ (C5 "delete the column"). | **No such column exists.** The BC / ARC-AI / M source markers are **inline pills INSIDE the Unit $ cell** (lines 29360–29366). "Removing the marker column" = removing those inline pills. It deletes **zero `<td>`s**. |
| The **only** empty/indicator column is that marker column. | The one real empty-header column is **`_bc` (header index 4)** sitting **between Part Number and Description** — it holds the TR checkbox + confidence "C" circle + blue "BC" circle (lines 29044–29082). This is the column that actually gets **emptied and removed** once its contents relocate. |
| C1 merges **two** BC indicators (red "+BC" pill + blue "BC" circle) that "signal the same thing." | There are **three** BC badges with **three different gates** (see §5.1). They do **not** signal the same thing. The blue circle is also the **click-to-match action button** — deleting it loses functionality. |

**Net column math (corrected):** remove `_bc` (1) + add TR, Status, 🔍 (3) = **net +2 columns**. Table goes from **13 → 15 columns**. (The Brief's +3/−1=+2 lands on the same number by coincidence — the "−1" is `_bc`, not a marker column; the marker-pill removal is structurally free.)

**Q4 grey token (answered precisely):** the Lead Time column renders AI/estimated values in **`C.muted` (`#94a3b8`) + `fontStyle:"italic"`** (line 29427). C5's AI-priced Unit $ must use exactly `C.muted` + italic to match; BC/manual stay `C.text` (`#f1f5f9`, current default). Reference the **`C` tokens**, not raw hex, so they can't drift.

---

## 1. Q2 — Element inventory (every render site, single-source confirmed)

The entire editable BOM table is **one component render** (`<table>` at 28756, `<tbody>` map at 28778–29532). It serves both editable and read-only views via the `readOnly` prop — **single source, no per-view duplication.** The customer-facing printed quote/traveler BOM is a **separate renderer** (see §4).

| # | Element | Line(s) | Currently in column | Gate | Single-source? |
|---|---|---|---|---|---|
| Header row | column labels array | **28773–28775** | — | always | ✅ one header |
| colgroup (widths) | `<col>` ×13 | **28761–28768** | — | always | ✅ |
| Row `#` counter | `{i+1}` | 29035 | col 0 (`#`) | always | ✅ |
| `Ref` (itemNo) | `{row.itemNo}` | 29043 | col 1 (`Ref`) | always | ✅ |
| **TR checkbox** (#199) | `<input type=checkbox>` + TR/TR✓ label | **29051–29056** | col 4 (`_bc`) | `_trShow&&(_trFlagged\|\|!readOnly)` | ✅ |
| **TR Resolve ✓** (#199 P2) | reviewer button | **29058–29061** | col 4 (`_bc`) | `_trShow&&_trUnresolved&&_trIsReviewer` | ✅ |
| **AI-confidence "C" circle** | `<span>C</span>` | **29067–29070** | col 4 (`_bc`) | `!labor&&!contingency&&(confidence==="low"\|\|"medium")` | ✅ |
| **Blue "BC" circle** (= fuzzy-lookup action) | `<button>BC</button>` | **29071–29080** | col 4 (`_bc`) | `!readOnly&&_bcToken&&priceSource!=="bc"&&!=="manual"` | ✅ |
| **🔍 browse (Part Number)** | `<button>🔍</button>` | **29092–29096** | col 3 (`Part Number`, left of input) | `f==="partNumber"&&!readOnly&&!labor&&_bcToken` | ✅ |
| **Red "+ BC" pill** | `<button>+ BC</button>` | **29214–29220** | col 3 (`Part Number`, inline badge) | `bcVerify.status==="not-in-bc"&&_bcToken` | ✅ |
| **Yellow "? BC" pill** (Brief missed this) | `<button>? BC</button>` | **29221–29234** | col 3 (`Part Number`, inline badge) | `bcVerify.status==="fuzzy"&&_bcToken&&!bcFuzzySuggestions[id]` | ✅ |
| **BC / ARC AI / M / LABOR source pills** ("marker") | `<span>` ×4 | **29360–29366** | **inside Unit $ cell** | `priceSource==="bc"/"ai"/"manual"` / `isLaborRow` | ✅ |
| bcSyncError ⚠ pill | `<button>⚠ …</button>` | 29367 | inside Unit $ cell | `bcSyncErrors[id]` | ✅ (see §5.2) |
| **Unit $ value input** | `<input>` | **29371–29379** | col 8 (`Unit $`) | always (labor→"— auto") | ✅ |
| Ext $ | `$(unit×qty)` | 29384–29385 | col 9 (`Ext $`) | always | ✅ |
| **Lead Time value input** | `<input>` | **29414–29427** | col 10 (`Lead`) | always | ✅ |
| Priced (date/staleness) | `<td>` | 29430–29462 | col 11 (`Priced`) | always | ✅ |
| Actions (delete/revert) | `<td>` | 29463+ | col 12 | `!readOnly&&!labor` | ✅ |
| **Meta sub-row** (from:/Cross/Co-Part pills) | `<tr>` colSpan 3+2+8 | **29489–29523** | under Part Number | `_pnHasExtraLines` | ✅ |

**Current header array (28773), 13 columns:**
```js
["#","Ref","Qty","Part Number","","Description","Manufacturer","Supplier","Unit $","Ext $","Lead","Priced",""]
//  0    1     2       3        4(_bc)     5             6            7         8       9      10      11    12
```

**The `_bc` column body** (col 4) is the render loop entry `["_bc",56]` at **29044**, rendered 29045–29082. It stacks (right-anchored flex): TR checkbox → Resolve ✓ → confidence "C" → blue "BC". Comment at 29044 notes it was widened 32→56 for the "C"+"BC" pair (#141/C84).

---

## 2. Q3 — AI-confidence circle: data source is safe to relocate ✅

**RESOLVED — no decision needed.** The confidence circle reads **`row.confidence`** directly (line 29067): renders when `confidence === "low"` (red `#ef4444`) or `"medium"` (amber `#f59e0b`); hidden when `"high"`. It does **not** live in the "marker column being removed" (the Brief's premise for Q3 was based on the wrong column model) — it lives in `_bc`, co-located with the blue BC circle per #141/C84.

Relocating it to the new **Status** column is a **pure JSX move**: the driving field (`row.confidence`) is on the row object, independent of render position. **No data-source risk.** `row.confidence` is set/cleared elsewhere (e.g. cleared to "high" on PN edit, ~26377) — untouched by this change.

---

## 3. Q4 — Unit $ styling hook + exact grey token ✅

**Clean hook exists.** The Unit $ value is the `<input>` at **29371–29379** with hardcoded `color:C.text`. C5's branch is a one-expression change on that input's `style`:

```js
// current (29375):
style={{...,color:C.text,...}}
// C5 target:
style={{...,color:row.priceSource==="ai"?C.muted:C.text,
            fontStyle:row.priceSource==="ai"?"italic":"normal",...}}
```

**Exact grey token to match (from the Lead Time column, line 29427):** AI/estimated lead values render `color:C.muted` + `fontStyle:"italic"`. So **`C.muted` = `#94a3b8`** is the grey; add italic to match precisely. Palette confirmed at **line 242–249**: `muted:"#94a3b8"`, `text:"#f1f5f9"`.

**Manual rows render white ✅:** `priceSource==="manual"` is not `"ai"`, so it falls to `C.text` (white) — matches the Brief ("BC-priced or otherwise good → white"). Labor rows show `"— auto"` (29369), unaffected.

**Invariant safe:** this restyles the **displayed value only**. It does not touch `_isBomRowFlaggedRed`, `_hasPrice`, `_isValidPrice`, or the red row-bg (29066). A red row keeps its red bg; the price value inside just gets grey-italic if AI-sourced (orthogonal).

---

## 4. Q5 — Print/PDF + responsive impact: contained ✅

- **The editable BOM table is the only render of this structure.** The customer-facing printed **quote / "Quoted BOM"** uses a **separate DOM/renderer** (per `docs/quote-print-system.md`, `#quote-doc`; RFQ table is another at ~19203). Adding TR/Status/🔍 columns to the editable table **does not touch** the printed quote. → **Recommend Marc spot-check the printed quote + traveler during live verify** to confirm zero bleed, but no code change is expected there.
- **`tableLayout:"fixed"` + `<colgroup>` (28756–28769)** means column widths come from the colgroup, **not** content. Adding 2 net columns requires updating the colgroup (§6.2) or widths silently redistribute. New columns are **fixed-narrow** (TR/🔍 ≈ checkbox/icon width; Status ≈ 56 for the circle pair), so total table width grows only ~+80px — fits the existing horizontal scroll container. No responsive breakpoint depends on the column count.

---

## 5. Open questions — need Jon/Analyst decision before build

### 5.1 C1 — the "two BC indicators" are actually **three**, with different meanings
| Badge | Line | Gate | Means |
|---|---|---|---|
| Blue **"BC"** circle | 29071 | `priceSource!=="bc"&&!=="manual"` | "not yet priced from BC — **click to fuzzy-match / browse**" (this is also the **action button**) |
| Red **"+ BC"** pill | 29214 | `bcVerify.status==="not-in-bc"` | "BC catalog verify says this PN is **absent from BC**" |
| Yellow **"? BC"** pill | 29221 | `bcVerify.status==="fuzzy"` | "a **close match exists** in BC" |

**They are not redundant.** The Brief's "remove red +BC, keep blue circle" would drop the *catalog-absent* signal entirely. **Recommendation (Coach):** keep the **blue "BC" circle** as the single Status-column BC indicator (it carries the click-to-match action). Then decide, for the red "+ BC" and yellow "? BC":
- **Option A** — fold both into the Status column too (Status becomes the one place for all BC state), OR
- **Option B** — leave "+ BC" / "? BC" as inline Part-Number badges (they annotate the PN, which is arguably where "this PN isn't in BC" belongs), and only the blue circle moves.

Coach leans **Option B** (least disruption; the two `bcVerify` pills are semantically PN annotations, not price/status). **Jon/Freddy to rule.**

### 5.2 C5 — removing source pills also removes "M" (manual) and "LABOR"
After C5, manual-priced and BC-priced rows both render **white with no pill** → visually **indistinguishable**. The Brief's C5 only speaks to AI-vs-BC. Confirm:
- **"M" (manual) pill** — remove (accept manual==white)? Coach reads the Brief's "otherwise good → white" as **yes, remove**.
- **"LABOR" pill** — labor rows show "— auto" for price; remove the LABOR pill too? (Cosmetic.)
- **bcSyncError "⚠" pill (29367)** — this is an **actionable error** (click → fix in Item Browser), **not** a price-source marker. **Coach recommends it STAYS.** Confirm.

### 5.3 TR Resolve ✓ button — goes with TR column
The reviewer Resolve ✓ (29058) is part of the TR workflow. **Recommend it moves into the new TR column** alongside the checkbox. Confirm (vs. Status).

---

## 6. DETAILED PLAN — exact edit sites (all in `src/app.jsx`)

**Target column order (LOCKED):** `# | Ref | TR | Qty | Status | 🔍 | Part Number | Description | Manufacturer | Supplier | Unit $ | Ext $ | Lead | Priced | (actions)` — **15 columns**.

### 6.1 Header array — line 28773
Replace with (adds TR, Status, 🔍; removes the empty `_bc` header):
```js
["#","Ref","TR","Qty","Status","🔍","Part Number","Description","Manufacturer","Supplier","Unit $","Ext $","Lead","Priced",""]
//  0    1    2    3      4       5        6              7             8            9         10      11     12     13   14
```
**Also update the header `textAlign` ternary (28774):** it currently centers via `h==="Lead"||hi<3`. The new narrow columns (TR=2, Status=4, 🔍=5) plus Qty(3) should center. Change to center by label set, e.g. `["#","Ref","TR","Qty","Status","🔍","Lead"].includes(h)` → center; `Unit $`/`Ext $` → right; else left. (Keying by label is drift-proof vs index.)

### 6.2 colgroup — lines 28761–28768
Rebuild to 15 `<col>` in the new order. Suggested widths (remove old 28px `_bc` col; add TR/Status/🔍):
```
# 42 · Ref 42 · TR 30 · Qty 56 · Status 56 · 🔍 30 · PartNumber 18% · Description 22% ·
Manufacturer 10% · Supplier 11% · Unit$ 116 · Ext$ 64 · Lead 48 · Priced 60 · actions 40
```
(Status keeps the old `_bc` width 56 — it holds the BC circle + confidence "C", the same pair `_bc` held.)

### 6.3 Body cells — split `_bc` and extract 🔍
The render loop at **29044** currently is:
```js
[["qty",56],["partNumber",0,"fit"],["_bc",56],["description",220],["manufacturer",0,"fit"],["_supplier",0,"fit"]]
```
Restructure the per-row `<td>` emission so the **left region** becomes, in order: `Ref`(existing 29043) → **TR `<td>`** → `Qty` → **Status `<td>`** → **🔍 `<td>`** → `Part Number` → `Description` → `Manufacturer` → `Supplier`. Concretely:

- **New TR `<td>`** (between Ref 29043 and Qty): move the TR checkbox+label (29051–29056) and — per §5.3 — the Resolve ✓ (29058–29061). Keep the driving predicates (`_trShow`/`_trFlagged`/`_trDisabled`/`_onTrToggle`/`_onTrResolve`/`_trUnresolved`, computed 28984–29031) **exactly where they are** — they're position-independent. This is a **JSX move only.** Add `data-tour="bom-tr"`.
- **New Status `<td>`** (between Qty and 🔍): move the confidence "C" circle (29067–29070) and the blue "BC" circle (29071–29080). Preserve the flex wrapper (29047) so the circle pair still right-anchors. Add `data-tour="bom-status"`. (If §5.1 Option A chosen, also relocate the "+ BC"/"? BC" pills here.)
- **New 🔍 `<td>`** (between Status and Part Number): move the browse button (29092–29096) out of the Part Number cell into its own cell. Add `data-tour="bom-search"`.
- **`_bc` column entry deleted** from the loop array; the Part Number cell keeps its input + all the *other* inline badges (Auto/ECO/Extract-Fix/? PN/⚠ qty/etc. 29154–29250) **except** the 🔍 (moved) and — per §5.1 — possibly the "+ BC"/"? BC" pills.

### 6.4 Unit $ restyle (C5) — lines 29358–29379
- **Remove** the source pills `BC`/`ARC AI`/`M` (29361–29366) and (per §5.2 confirm) `LABOR` (29360). **Keep** the bcSyncError ⚠ pill (29367).
- **Restyle** the value input (29375) per §3: `color:priceSource==="ai"?C.muted:C.text`, `fontStyle:priceSource==="ai"?"italic":"normal"`.

### 6.5 Red "+ BC" pill (C1) — line 29214 (+ yellow "? BC" 29221)
Per §5.1 ruling: either delete the red "+ BC" and keep only the blue circle (Brief's literal ask — **not recommended alone**, loses catalog-absent signal), or **Option B** — leave both `bcVerify` pills inline on Part Number and only relocate the blue circle to Status. **Await §5.1 decision.**

### 6.6 colSpan / span sites (13 → 15) — MUST all update together
| Site | Line | Now | New |
|---|---|---|---|
| ECO group header | **28928** | `colSpan={13}` | `colSpan={15}` |
| Meta sub-row lead spacer | **29490** | `colSpan={3}` (#,Ref,Qty) | `colSpan={6}` (#,Ref,TR,Qty,Status,🔍) |
| Meta sub-row content | **29491** | `colSpan={2}` (PN+_bc), pad `0 5px 6px 38px` | `colSpan={2}` (PN+Desc); **recompute left pad** — the old 38px indented under the in-cell 🔍 which is now its own column, so drop/adjust the indent |
| Meta sub-row trailing spacer | **29522** | `colSpan={8}` | `colSpan={7}` |
(Meta-row total must equal 15: 6 + 2 + 7 = 15 ✅.)

**Not in scope (verify only):** the `colSpan={7}` "Total Sale Price" row at **30824** is a **different table** (quote summary, 8 cols) — confirm untouched. Empty-state colSpans at 22909/39757/etc. are other tables.

### 6.7 data-tour anchors (F001 readiness)
Add `data-tour="bom-tr"`, `data-tour="bom-status"`, `data-tour="bom-search"` to the three new `<td>`s (cheap now per Brief §3.5). Confirm naming with whoever builds the F001 walkthrough steps.

---

## 7. Invariant-protection checklist (Brief §3)

| Invariant | How this Plan preserves it |
|---|---|
| **1. #199 TR logic byte-for-byte** | TR checkbox/Resolve are a **JSX relocation**; all predicates + handlers (28984–29031), the auto-stamp @38978, the send-gate, count-fix (107b960b), await-save (41824f6c) are **not touched**. |
| **2. #178/#179/`_isBomRowFlaggedRed` untouched** | C5 restyles the Unit $ **value color/style only** (29375). Red row-bg (29066), `_hasPrice`, `_isValidPrice`, `_isValidLT`, RFQ predicates — **zero edits**. |
| **3. `priceSource` semantics** | Uses existing `"bc"/"ai"/"manual"` values (29361–29366 confirm). Manual → white verified (§3). |
| **4. Data retention** | Pure display/layout. **No Firestore field add/remove/rename.** No save-path edits. |
| **5. `data-tour` readiness** | Anchors added on the 3 new columns (§6.7). |

---

## 8. Test criteria (for live verify, matrix-arc-test)

1. Column order renders exactly `# Ref TR Qty Status 🔍 Part# Desc Mfr Supplier Unit$ Ext$ Lead Priced ⋯`.
2. **TR:** checkbox in TR column toggles a manual flag; supplier flag shows checked+disabled; Resolve ✓ (reviewer) clears it — **identical behavior to pre-F002**; send-gate still blocks on unresolved TR.
3. **Status:** blue "BC" circle appears on unpriced rows and still triggers fuzzy-lookup/browser on click; confidence "C" (amber/red) appears for medium/low rows, hidden for high.
4. **🔍:** browse button in its own column opens the BC Item Browser pre-filled.
5. **C5:** AI-priced Unit $ = grey (`#94a3b8`) + italic, **matching the Lead column** exactly; BC & manual Unit $ = white; source pills gone; ⚠ sync-error pill still present.
6. **Red rows still red** (`_isBomRowFlaggedRed` unchanged) — a red AI-priced row shows red bg + grey-italic price.
7. Meta sub-row (crossed "from:" / Co-Part / Cross pills) still sits under Part Number, aligned.
8. ECO group header bar still spans the full width (colSpan 15).
9. Printed **quote + traveler** BOM unchanged (separate renderer — spot check).
10. `node validate_jsx.js` clean.

---

## 9. Pipeline / HOLD

Per per-phase gating: **this deliverable → Freddy Analyst Review → Jon approves the Plan (H-item step 4) → THEN Marc builds.** No code before Jon's explicit go. Two items block a clean build and need Jon's ruling first: **§5.1 (C1 three-badge)** and **§5.2 (M/LABOR pill removal)**.
