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

## 2. Resulting column order (target)
```
Ref | [TR ✚] | Qty | [🔍 ✚] | Part Number | … existing middle … | Supplier | ✗(marker col REMOVED) | Unit $ | … | Lead Time | …
                                                                                    ↑ Unit $ now carries the AI/BC signal via grey-italic vs white
[Status ✚]  ← new; holds BC circle + AI-confidence circle. Exact position TBD (§4).
```
Net: **+3 columns** (TR, 🔍, Status), **−1 column** (BC/ARC-AI marker), **−1 inline element** (red +BC pill).

## 3. Invariants to PROTECT (do not regress) — for Coach's trace + Marc's build
1. **#199 Tech-Review flag** — the checkbox behavior, auto-stamp on supplier cross (`@38978`), hard send-gate, and reviewer Resolve/approve-sweep must be **byte-for-byte unchanged** — this is a **relocation only**, not a logic change. The send-block count fix (`107b960b`) and the await-save fix (B004 `41824f6c`) stay intact.
2. **#178 `_hasPrice` / #179 `_isValidPrice` / `_isValidLT` / `_isBomRowFlaggedRed`** — the red-row highlighting and RFQ-eligibility predicates must be **untouched**. C5 changes only how the Unit $ *value* is **styled**, never what counts as priced/valid/red.
3. **`priceSource` semantics** — `"manual"` / `"bc"` / `"ai"` values drive C5's styling (AI → grey italic; bc/manual/good → white). Confirm the exact source values and that manual edits still render white (not grey-italic).
4. **Data retention** — pure display/layout change; no Firestore field add/remove/rename. All row metadata flags preserved on save.
5. **`data-tour` readiness** — since this feeds F001, Marc should add `data-tour` anchors to the new TR / 🔍 / Status columns while restructuring (cheap now, saves a second pass).

## 4. Open questions (Coach's Supplement to resolve; one is Jon's)
- **Q1 (Jon) — where does the "Status" column sit?** Not specified. Candidates: (a) immediately after **Part Number** (front-of-row, at-a-glance), (b) where the removed marker column was (between Supplier and Unit $), (c) far right. *Freddy leans (a).*
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
