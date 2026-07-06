# F002 — BOM Column Reorg / Indicator Cleanup — BRIEF

**Author:** Freddy Lyst (Analyst)
**Date:** 2026-07-06
**Status:** Discovery → routing to Coach for code-trace + Plan
**Category:** F002 (Feature). **Motivation:** declutter the BOM table so the **F001** training walkthrough is clean and concise — columns are overloaded with pills/checkboxes/markers.

---

## 1. The five changes (Jon's spec, 2026-07-06)

| # | Change | Detail |
|---|--------|--------|
| **C1** | **Merge the two BC indicators into one** | The red **"+BC" pill** and the blue **"BC" circle** signal the same thing (part not in BC / needs matching). **Remove the red "+BC" pill**; keep the **blue "BC" circle** as the single indicator. |
| **C2** | **New "TR" column** between **Ref** and **Qty** | Move the Tech-Review checkboxes (#199) into it. **Fixed width** — just wide enough for the checkbox. |
| **C3** | **New "🔍" column** between **Qty** and **Part Number** | Move **all search-icon links** into it. **Fixed width** to fit the icons. |
| **C4** | **New "Status" column** | Holds the blue **"BC" circle** (from C1) **and** the **AI-confidence circle**. *(Position not specified by Jon — see §4 open Q.)* |
| **C5** | **Remove the "BC / ARC-AI" marker column** (currently between **Supplier** and **Unit $**) | Delete the column entirely. Convey the AI-vs-BC pricing signal by **styling the Unit $ value instead**: <br>• **ARC-AI-priced** → show Unit Cost in **grey** (same grey as the Lead Time column values) + **italic**. <br>• **BC-priced (or otherwise good)** → **normal white text**, exactly as a good row shows today. Nothing extra. |

## 2. Resulting column order (target) — LOCKED (Jon, 2026-07-06)
```
Ref | [TR ✚] | Qty | [Status ✚] | [🔍 ✚] | Part Number | … existing middle … | Supplier | ✗(marker col REMOVED) | Unit $ | … | Lead Time | …
                                                                                                          ↑ Unit $ now carries the AI/BC signal via grey-italic vs white
```
- **TR** between Ref and Qty (C2). **Status** between Qty and 🔍 (C4, resolved). **🔍** between Status and Part Number (C3). BC/ARC-AI marker column removed (C5).
- Net: **+3 columns** (TR, Status, 🔍), **−1 column** (BC/ARC-AI marker), **−1 inline element** (red +BC pill).

## 3. Invariants to PROTECT (do not regress) — for Coach's trace + Marc's build
1. **#199 Tech-Review flag** — the checkbox behavior, auto-stamp on supplier cross (`@38978`), hard send-gate, and reviewer Resolve/approve-sweep must be **byte-for-byte unchanged** — this is a **relocation only**, not a logic change. The send-block count fix (`107b960b`) and the await-save fix (B004 `41824f6c`) stay intact.
2. **#178 `_hasPrice` / #179 `_isValidPrice` / `_isValidLT` / `_isBomRowFlaggedRed`** — the red-row highlighting and RFQ-eligibility predicates must be **untouched**. C5 changes only how the Unit $ *value* is **styled**, never what counts as priced/valid/red.
3. **`priceSource` semantics** — `"manual"` / `"bc"` / `"ai"` values drive C5's styling (AI → grey italic; bc/manual/good → white). Confirm the exact source values and that manual edits still render white (not grey-italic).
4. **Data retention** — pure display/layout change; no Firestore field add/remove/rename. All row metadata flags preserved on save.
5. **`data-tour` readiness** — since this feeds F001, Marc should add `data-tour` anchors to the new TR / 🔍 / Status columns while restructuring (cheap now, saves a second pass).

## 4. Open questions (Coach's Supplement to resolve; one is Jon's)
- **Q1 (Jon) — where does the "Status" column sit? → RESOLVED (Jon, 2026-07-06): between Qty and 🔍.** Final left-region order: `Ref | TR | Qty | Status | 🔍 | Part Number`.
- **Q2 (Coach) — element inventory.** Locate every render site in `src/app.jsx`: the +BC pill, the BC circle, the AI-confidence circle, the TR checkbox, the search-icon links, the BC/ARC-AI marker column, and the Unit $ cell. Confirm each is a single source (not duplicated per view).
- **Q3 (Coach) — AI-confidence circle.** What drives it today (field/threshold), and does it currently live in the marker column being removed? Confirm relocating it to Status doesn't drop its data source.
- **Q4 (Coach) — Unit $ styling hook.** Is there a clean place to branch the Unit $ cell style on `priceSource === "ai"`? Confirm the exact grey token used by the Lead Time column so C5 matches it precisely.
- **Q5 (Coach) — responsive/print.** Does the quote-print / PDF path or any narrow-view rendering depend on the current column set? +3/−1 columns must not break print layout.

## 5. Pipeline (per-phase gated — HOLDS for Jon between phases)
1. **Brief** (this doc) → route to **Coach**.
2. **Coach** — code-trace (§4 Q2–Q5) + **build Plan** (exact edit sites, column order, styling hook) → **Analyst Review** (Freddy) → **Jon approves the Plan** (H-item step 4 — no code before this).
3. **Marc builds** — relocate TR + search icons, add Status col, remove marker col + red pill, restyle Unit $, add `data-tour` anchors. Runs `validate_jsx.js`.
4. **Live verify** — Marc + Jon confirm all five changes on matrix-arc-test against a real BOM (TR still gates sends; red rows still red; AI prices grey-italic; BC prices white; search icons + checkboxes work in new columns). Coach reviews.
5. **Jon sign-off → deploy** (its own checkpoint).

---

## 6. ANALYST REVIEW + JON RULINGS (Freddy, 2026-07-06)

**Analyst Review of Coach's Supplement+Plan (`docs/F002-COACH-SUPPLEMENT-AND-PLAN.md`, tip 5f221935):** APPROVED as sound — single-source verified per element with line numbers, invariants provably protected (C5 restyles the value only; TR is a pure JSX move; zero Firestore changes), column math corrected to 13→15. Coach's three divergence catches are valid and material. Rulings below resolve §5.1/§5.2; they **supersede** the Brief's original C1/C5 wording.

### RULING R1 — C1 is now a SINGLE tri-state BC circle (supersedes "remove red +BC pill")
Jon: collapse the three BC badges into **ONE circle** in the **Status** column, color = state, with priority:
- **RED** — part **not in BC catalog** (`bcVerify.status==="not-in-bc"`). Means **"add & link."** **RED takes priority over YELLOW/BLUE** (resolving red resolves the others). Click action = the current red "+ BC" add-and-link flow (Coach confirm the exact onClick).
- **YELLOW** — **fuzzy/close match exists** (`bcVerify.status==="fuzzy"`). **Functions identically to BLUE** (click → match/link); yellow only signals "a close match exists."
- **BLUE** — in BC, **needs matching/linking** (the current blue-circle gate `priceSource!=="bc"&&!=="manual"` && `_bcToken`, when not caught by RED/YELLOW). Click → fuzzy-match/browse (current blue action).
- **(none)** — matched / BC-priced → no circle.
- Coach to define the **exact precedence predicate** (RED > YELLOW > BLUE > none) merging the `bcVerify` gates (red/yellow) with the `priceSource` gate (blue), and confirm whether RED's click flow differs from BLUE/YELLOW's (Jon says red = add+link, blue/yellow = match+link — may share the same fuzzy-lookup/browser flow). The single circle **co-exists** with the AI-confidence "C" circle in Status (Status holds up to 2 circles).

### RULING R2 — C5: AI **and Manual** both render grey+italic (supersedes "manual → white")
Jon (corrected): **`priceSource==="ai"` OR `priceSource==="manual"` → `C.muted` (#94a3b8) + italic**; **`priceSource==="bc"` → `C.text` (white)**. Rationale: BC is the authoritative price (white); AI estimates and manual entries are "softer" (grey/italic). The existing budget-vs-confirmed manual modal complements this.
- **⚠ OPEN NUANCE (flagged to Jon; v1 assumption):** there is a budget-vs-confirmed manual modal. **v1 treats ALL manual as grey+italic.** Coach to identify the budget/confirmed field so we *could* later differentiate (e.g. confirmed-manual → white) if Jon wants — but not in v1 unless Jon says so.

### Confirmed defaults (Coach's recommendations, Freddy accepts)
- **§5.2 — ⚠ `bcSyncError` pill STAYS** (it's an actionable error, not a source marker).
- **§5.2 — LABOR pill removed** (cosmetic; labor rows already show "— auto").
- **§5.3 — TR Resolve ✓ button moves into the TR column** with the checkbox.

### Next step
Rulings routed to Coach to **revise the Plan** (§5.1→R1 unified circle in §6.5/§6.3; §5.2→R2 in §6.4). Revised Plan → Freddy quick re-review (matches rulings?) → **Jon's build-approval gate** → Marc builds.

### APPROVED FOR BUILD (2026-07-06)
- **Coach Plan Rev 1** (`docs/F002-COACH-SUPPLEMENT-AND-PLAN.md` §10, tip 38039b5b) — **Freddy re-review: PASS** (faithfully encodes R1/R2; invariants protected; R2's budget/confirmed distinction falls out of existing `priceSource` for free — budgetary-manual→grey, confirmed-manual stored as `bc`→white).
- **Jon: APPROVED the build** → routed to **Marc**. Build per Rev 1 §10 (authoritative) + §6 (header/colgroup/TR+🔍 relocation/colSpan/data-tour).
- **Two non-blocking live-verify watch-items:** (1) BC-circle vs confidence-"C" palette collision (BC-red `#dc2626`/BC-yellow `#fcd34d` vs conf `#ef4444`/`#f59e0b`); (2) readOnly visibility of RED/YELLOW (informational, preserved).
- **Gating:** code-complete ≠ deploy. After build + `validate_jsx.js`, Marc+Jon live-verify on matrix-arc-test (T1′–T10 in §10.5/§8), Coach reviews, THEN Jon releases deploy as its own checkpoint.

---

## 7. REV 2 — three TR-refinement additions (Jon, 2026-07-06, surfaced during live verify)

Jon surfaced three TR refinements while eyeballing the live F002 build. **Ruling: FOLD INTO F002** (same TR/BOM-row code; F001 waits on the final UI regardless — avoid shipping then re-churning). F002 deploy slips to include these. **Rev 1 verify results (T1/T3′/T4/T5′/T6/T7/T10 PASS, T2 wiring verified) stand** — Rev 2 adds on top.

| # | Change | Scope note |
|---|--------|-----------|
| **C6** | **Remove the "TR"/"TR✓" text label** beside the TR checkbox (both unresolved + resolved states) — checkbox only. | Trivial presentation. With text gone, unresolved-vs-resolved is conveyed by checkbox state (checked+enabled vs checked+disabled) + **C8 row color**. Confirm sufficient at verify. |
| **C7** | **"Approved" chip shows ONLY when the Engineer opens for Technical Review** (reviewer TR context) — not in the normal BOM view. | **Trace-gated:** Coach/Marc must first determine whether the current showing is an **F002 regression** (column move dragged the chip's render) or **pre-existing #199 behavior** Jon now wants re-gated. Regression → must-fix; new-gate → scoped change. |
| **C8** | **TR-flagged + unresolved row → YELLOW bg, overriding red**, until Tech Review approved. On approval → override ends, normal highlight resumes (**red returns if still unpriced/stale**). | **VISUAL-ONLY override — critical:** `_isBomRowFlaggedRed` (and RFQ-eligibility / all predicate consumers) must stay UNCHANGED. Only the displayed row bg is overridden: `bg = (TR-flagged && unresolved) ? yellow : (_isBomRowFlaggedRed ? red : normal)`. The row is still "red" for logic/RFQ purposes; only the color the user sees flips to yellow while TR is pending. This **supersedes** the Brief §3.2 / Rev1 §10.6 "row-bg untouched" line — but at the DISPLAY layer only; the predicate invariant holds. Coach to define the exact precedence hook + confirm no predicate consumer regresses. |

**Rev 2 pipeline:** Marc live-trace observations (label source / C7 regression-vs-new / C8 baseline) → Coach Rev 2 trace + Plan (C7 + C8; C6 trivial) → Freddy Analyst Review → Jon approves Rev 2 Plan → Marc builds → re-verify (incl. C6/C7/C8 + re-confirm T1/T3′/T5′/T6 didn't regress) → Coach review → Jon deploy checkpoint.

**Item-3 (C8) precedence — LOCKED (Jon):** yellow while TR-pending; after approval, normal highlight logic resumes (red returns if the row is still unpriced/stale). Approval does NOT suppress pricing-red — it only ends the TR-pending yellow override.

### REV 1 LIVE-VERIFY RESULT (Marc, matrix-arc-test, commit c8cbbca7) — ALL PASS
Every live-testable criterion PASSED: T1 column order (15 cells ×46 rows), **T2 TR flag + send-gate fires through the pricing mask** ("1 line need Technical Review", count 9→10, resolved rows don't count — #199 gate intact post-relocation), T3′ BC circle red+blue (multiBcRows=0, precedence works), T4 🔍 opens browser pre-filled, T5′ Unit $ grey-italic (ai/manual) vs white (bc) only, T6 30 red rows intact, T7 meta sub-row 6+2+7=15, **T8 ECO header colSpan=15 (live, PRJ402065)**, T9 print CODE-VERIFIED (all 11 diff hunks inside the editable table 28758–29529; `#quote-doc` at 20415 untouched), T10 validate_jsx clean. Watch-item #1 palette CLOSED (Jon accepted). Watch-item #2 readOnly CONFIRMED live (BLUE + 🔍 hidden in readOnly).
**Two states CODE-VERIFIED only** (no qualifying live row existed, flagged not skipped): T3′-**YELLOW** circle (no `bcVerify=fuzzy` row), and RED/YELLOW-in-readOnly (those states resolve before lock). — **These will get a live pass opportunity during Rev 2 re-verify if a fuzzy row is available.**
**Loose end (G005, note-only):** PRJ402111 carries 2 TR test flags — row 4 RESOLVED, **row 8 (800H-AR6A) UNRESOLVED** → keep row 8 as a ready-made unresolved-TR row for the C8 (yellow) re-verify.
**Rev 1 is banked but NOT deployed** — F002 ships complete (Rev 1 + Rev 2) after Rev 2 build + re-verify + Coach review + Jon's deploy checkpoint.

### REV 2 TRACE FINDINGS (Marc, 2026-07-06) — none are F002 regressions
- **C6** — the "TR"/"TR✓" label is the span at **app.jsx:29072** (`{_trUnresolved?"TR":"TR✓"}`), pre-existing #199, moved byte-for-byte in F002. **Removal = delete that span (1-line, no logic).** Confirmed F002 Rev 2 scope. LOCKED.
- **C8** — `rowBg` (**app.jsx:28966**) is computed from labor/ECO/restoreSkipped/`_isBomRowFlaggedRed`/zebra — **no `techReviewFlag` term today**, so flagging never changes bg (deliberate #199 design: amber TR glyph separate from red price-bg). C8 = **insert TR-yellow ABOVE red in the 28966 ternary**, visual-only (predicates untouched). Confirmed new behavior, baseline verified. LOCKED.
- **C7 — AMBIGUOUS / likely a DIFFERENT SUBSYSTEM.** The only "Approved" chip Marc locates is **"✓ Pre-Review Approved" at app.jsx:36006**, gated on `project.preReviewStatus==="approved"`, rendered in the **panel quote-summary/action area — NOT the BOM table**, and **outside F002's diff** (F002 hunks = 28758–29529). So it's pre-existing pre-review-workflow behavior, **not an F002 regression** and **not a BOM change**. grep finds **no TR-specific "Approved" chip in the BOM**. → **C7 needs Jon to identify the exact element/view.** If it's the project-level pre-review chip, C7 is a **separate-subsystem change → split to its own item (F003)**, NOT folded into F002 (which is BOM-table scope). **C7 HELD pending Jon.**

**Revised Rev 2 routing:** C6 + C8 → Coach Rev 2 trace+Plan (BOM scope, ready). **C7 held** — pending Jon's identification of the "Approved" element; likely spins out as F003 (pre-review subsystem).

### C7 CLARIFIED (Jon, 2026-07-06) — it's the RESOLVE ✓ chip, IN the TR column → stays in F002 Rev 2
Jon's "Approved chip" = the green **Resolve ✓** button (the per-row reviewer resolve action, `rgb(74,222,128)`), NOT the pre-review chip. It lives in the TR column F002 relocated (earlier inventory: gate `_trShow && _trUnresolved && _trIsReviewer`). **So C7 is NOT a separate subsystem — it's a TR-column gating change, F002 Rev 2.**
- **Intent (Freddy's read, Jon to confirm):** the Resolve ✓ should show **only when the Engineer is actually in a Technical Review context** — not on every unresolved row in the normal quote-building BOM view (today it shows whenever `_trIsReviewer`).
- **Coach trace needed (added to Rev 2):** what does `_trIsReviewer` / the Resolve gate key on today? Is there an existing "Engineer opened Technical Review" state/mode/view to gate on (e.g. a sent-for-tech-review project state, a reviewer-opened-review flag), or must one be defined? **Deliver as OPTIONS for Jon** (existing-context vs new-context), not a built gate — Jon rules at Rev 2 plan review.
- **C7 is now part of Coach's Rev 2 scope** (C6 + C8 + C7). Supersedes the "C7 held / likely F003" note above.

### C7 SUPERSEDED → ROLE-DIFFERENTIATED TR-REVIEW REDESIGN (Jon, 2026-07-06)
Presented Coach's A/A′/B gate options; Jon instead **redesigned the whole TR interaction** (A/A′/B are now moot). **This is materially bigger than the planned ~1-line C7 gate — it does NOT proceed to build; it needs a design spec + Coach feasibility trace + open-Q resolution → plan → Jon approval → build.** Rev 2 build **HELD**.

**Jon's design (verbatim intent):**
- **User (non-engineer / Sales):** sees a **checkbox** only. Check → row turns **YELLOW** ("in review"). Uncheck → clears yellow, reverts to current state.
- **Assigned Engineer:** does NOT see the user's checkbox — sees an **empty green circle + yellow row** ("needs engineer attention"). Engineer checks the circle → review satisfied → row returns to current state + circle shows a **checked mark**.
- **Gate:** Tech Review **cannot be Approved or Rejected until all yellow rows are addressed** (every green circle checked).

**Freddy interpretation:** this is a **role-differentiated TR control** — same row renders a *user checkbox* vs an *engineer green-circle* by viewer role/context; yellow = the shared "in review" signal; approve/reject is blocked until all rows individually addressed (replaces the current #199 approve-**sweep** that auto-resolves everything). Folds C6 (bare checkbox) + C8 (yellow) into one integrated model; **supersedes the piecemeal C6/C7/C8 build** (avoid re-churn — build the integrated model once).

**OPEN QUESTIONS (scope pass — Coach traces feasibility, Jon rules design):**
1. **Auto-stamp:** #199 auto-flags rows for TR on supplier crosses (unconditional). Keep auto-flag, drop it (user-manual-only), or keep-but-user-can't-uncheck-auto-flagged?
2. **User uncheck during review:** once out for review, can the User still uncheck (pull back) a row, or is it locked to the engineer's green-circle?
3. **Role boundaries:** "Engineer" = `preReviewAssignedTo`? What do **admin** and **non-assigned reviewers** see (checkbox or circle)?
4. **When does the engineer's green-circle view replace the user's checkbox** — whenever the viewer is the assigned engineer, or only while `preReviewStatus==="pending"` (out for review)?
5. **Green circle:** restyle of the existing Resolve ✓ button (repurpose `_onTrResolve`) or a new control?
6. **Approve/reject gate:** replaces the current approve-sweep (34396–34416, auto-resolves all) with "blocked until every yellow row individually addressed"? Reject too?
7. **Send-gate:** does a yellow (unaddressed) row still hard-block quote sends (as #199 does today)? (Presumably yes — confirm.)

**Judgment / path:** REDESIGN — bigger lift than A/A′ (~1 line). Recommend: capture as a design spec, route to Coach for a **feasibility trace** against the existing #199 + pre-review architecture (can it support this cleanly + what's the lift), resolve the open Qs, bring Jon a plan to approve, THEN build once. **C6/C8 fold in (no separate build). F002 packaging (fold vs new F003) decided once the lift is known.**
