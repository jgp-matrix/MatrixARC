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
