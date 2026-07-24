# F065 — Cross-Line (cross-panel) Part# price/lead-time propagation — Analysis

**Author:** Freddy Lyst (analyst) · **Trace:** Sam Wize (Coach), read-only · **Date:** 2026-07-24
**Status:** ANALYSIS COMPLETE — DECISION PENDING (mode: AUTO vs CONFIRM). No build until Jon go + Coach review.
**Motivating example:** PRJ402142 (multiple Lines carrying the same Part# across BOMs).

---

## The ask (Jon)
A project has multiple **Lines** (`project.panels[]`, each with a BOM = `panel.bom[]`). The same Part# often
appears on multiple Lines within ONE job. When a Part#'s **price / lead-time** is updated on one Line (via BC,
manual entry, or portal), **automatically propagate that update to the matching Part# rows on the other Lines** in
the same project. Cross-PROJECT is out of scope.

---

## Key finding: the mechanism already exists
Two shipped paths already propagate a price/lead-time map across ALL panels by matching Part#:
- **`doApplyPortalPrices`** (`src/app.jsx:40479-40524`) — maps every row in every panel whose `normPart(partNumber)`
  hits the supplier's `priceMap`/`leadTimeMap`, then persists with ONE `saveProject`.
- **Vendor-scraper apply** (`:41085-41104`) — same all-panels fan-out.

The single-row handlers are the gap — they're panel-scoped only:

| Handler | file:line | Fields set | Save scope |
|---|---|---|---|
| Cell edit `updateBomRow` | `:28005` | `[field]` (unitPrice, leadTimeDays + source/updatedAt) | single panel |
| Manual price confirm `applyConfirmedPrice` | `:28540` | `unitPrice, priceSource:"bc", priceDate, bcPoDate, bcVendorName, bcVerify` + BC push | single panel |
| Budgetary `applyBudgetaryPrice` | `:28525` | `unitPrice, priceSource:"manual", priceDate:null` | single panel |
| BC cross/commit `commitBcItem` | `:28214` | `bcNo, partNumber, priceSource:"bc", unitPrice, priceDate, bcPoDate` + async `leadTimeDays, leadTimeSource:"bc_item"` | single panel |
| Portal apply `doApplyPortalPrices` | `:40304` | per-row price + leadTime | **ALL panels** (precedent) |

## Matching / normalization (already factored)
- **`normPart(s)`** `:51751` = `(s||'').replace(/[\s\-\.]/g,'').toUpperCase()` — canonical "same Part#" key.
- **`partMatch(a,b)`** `:51925` = normalized equality OR anchored ≥5-char prefix/suffix containment (fuzzy). Used as
  portal fallback. **Risk: over-matches short PNs** → for propagation, use exact `normPart` equality only.
- **Crossed rows:** after a cross, `partNumber` = the NEW part, `crossedFrom` = the old (`:28321-28322`). Matching on
  `partNumber` correctly targets rows now carrying the same replacement part.
- **Must exclude** (reuse `_isExcludedFromPriceCheck` `:16792`): blank/`"?"`/`"N/A"`/`"EXTRACTION_FAILED"` PNs,
  labor rows, `customerSupplied`, `isContingency`, buyoff/crate, Matrix-Systems-vendor rows.

## Save path
Build `updatedPanels` (all panels) → call **`saveProject` ONCE** (`:9720`) — exactly what `doApplyPortalPrices`
does. Do NOT loop `saveProjectPanel` per panel (each does a full doc read/write, serialized by `_panelSaveLocks`
→ N round-trips + interleave risk). One `saveProject` is the proven, safe pattern. Guards preserved automatically
(dataUrl strip, high-water preservation, `schemaVersion`, owner-lock preserve, quoteRev/`_noBumpWrite`).

## Guards any propagation MUST respect
| Guard | State | file:line | Implication |
|---|---|---|---|
| Sent-quote freeze (F048) | **No hard freeze today** — a content edit to a sent BOM bumps `quoteRev` + re-arms | `:10272-10277` | Propagation to a sent project would demote it to IN-PROCESS. Tie to F048 lock when built. |
| Owner-priority lock | Disables 13 destructive/pricing buttons when active | `:30364`, rules `isOwnerPriorityLocked` | Must gate — block/defer if `ownerPriorityActive`. |
| Red-rule SSOT | `_isBomRowFlaggedRed` via `_effectivePriceDate` + `_hasFirmLeadTime` | `:16825` | Run propagated rows through the SAME predicate so red clears/keeps correctly. |
| RFQ-only kill-switches | `AUTO_PRICING_ENABLED` / `AUTO_BC_REPRICE_ENABLED` / `SCRAPER_BC_WRITEBACK_ENABLED` = false | `:5515-5527` | These gate *automated price discovery*; comments say manual/portal/import are UNAFFECTED. A **CONFIRM** propagation is clearly outside them; a **SILENT AUTO** one has the same "value moved without a human looking" shape → should sit behind its own default-off flag. |

## The one real danger: clobbering a legitimately-different per-Line price
Legitimate per-Line divergence is real and the code already protects some of it:
1. **Different vendor sourcing per Line** — Line quoted from vendor A vs vendor B (`bcVendorNo` differs).
2. **Manual override** — `priceSource:"manual"` is treated as **sacred**: portal apply (`:40514`) and scraper apply
   (`:41094`) both explicitly SKIP manual rows. **Propagation MUST honor the same carve-out** (this is exactly
   "Noah's bug" `:40508-40513`).
3. **Qty-break pricing** — same PN at qty 5 vs qty 50 has a different unit cost; the row model records no qty-break
   basis, so auto-copying `unitPrice` across Lines with different `qty` can silently apply the wrong break.
4. **Lead time is lower-risk** than price — same part → same lead time is usually valid.

## Feasibility verdict
Cleanly implementable. Natural insertion point = one shared helper
`propagatePartAcrossPanels(project, partNumber, {price?, leadTime?}, opts)` mirroring the `doApplyPortalPrices`
all-panels map: skip `priceSource:"manual"` + `_isExcludedFromPriceCheck` rows, match on a new SSOT `_samePart`
(exact `normPart`) predicate, run through `_isBomRowFlaggedRed`, persist with ONE `saveProject`. Hook into the
single-row handlers after their existing panel write; guard with `ownerPriorityActive` + (for async BC paths) a
post-await project-identity re-check (Async Ownership rule). **Biggest risk = silent clobber of a legit per-Line
price → argues for CONFIRM, not AUTO** (and mandatory manual-skip regardless).

---

## Options for Jon
**A. CONFIRM (surfaced) — Freddy recommendation.** On a price/LT update, if the same Part# is on other Lines,
show a small prompt: "Part# X is also on Line 2 ($Y) and Line 3 ($Z) — update them to $NEW? [Update all / choose /
skip]". Neutralizes all four clobber risks; incident-proof; clearly outside the RFQ-only kill-switches. Lead-time
could default to lighter-touch (auto or pre-checked) since it's low-risk.

**B. AUTO (silent) behind a default-off flag.** Propagate silently, honoring the manual-skip carve-out, gated by a
new `CROSS_LINE_PROPAGATION_ENABLED` flag defaulting off, with a toast + undo. Faster in the common case but carries
the PRJ402119 risk shape for price.

**C. Split:** lead-time = AUTO (low risk), price = CONFIRM (high risk). Best-of-both; slightly more UI.

**Match strictness (all options):** exact `normPart` equality only — NOT the fuzzy `partMatch` (over-matches short PNs).
**Triggers (all options):** fire from `updateBomRow` (cell edit), `applyConfirmedPrice` (BC confirm-push), and
`commitBcItem` (BC cross) — the user-driven price/LT writes.

## Live-verify note (optional, Jon-driven)
Confirming the actual overlap on **PRJ402142** (how many Part#s repeat across its Lines, and whether any repeat with
*different* vendor/price = the exact case CONFIRM protects) needs a live Firestore read in the controlled tab — the
design doesn't depend on it, but it'd validate the value + surface any real divergence to tune the default.

---

## ★ DECISION (Jon, 2026-07-24) — REFRAMED ARCHITECTURE (supersedes the live-scan approach above)
Jon refined the design to a **persisted duplicate-index + lookup-gated prompt** model (cleaner than scanning all
panels live on every edit):

1. **Poll the project for duplicate Part#s** — compute the set of Part#s that appear across >1 BOM/Line.
2. **Store the list on the project's Firestore doc** (persisted). Recompute when a BOM changes so it stays fresh
   (proposed: recompute on `saveProjectPanel` structural change + on project open). Additive field, e.g.
   `crossLineDuplicates` — per data-retention rules never remove/rename; preserved on save.
3. **On a price / change / lead-time edit**, check the stored list; if the edited Part# is a known duplicate,
   **prompt the user** to update the matching parts on the other Lines (with count + per-Line current values).
4. **Active project ONLY** — no cross-project effect (aligns with the Async/Multi-Project Ownership rule).

**Implementation deltas from the original plan:**
- The `_samePart` (exact `normPart`) SSOT predicate now also builds the stored index (one rule, two consumers:
  index-builder + edit-time lookup).
- The persisted index is a perf/UX gate (decide whether to prompt at all) — the actual propagation still uses the
  proven all-panels `saveProject` write.
- Manual-override skip (`priceSource:"manual"`), `_isExcludedFromPriceCheck`, owner-priority gate, and red-rule
  re-run all still apply.

**RECONCILED (Jon, 2026-07-24):**
- **Prompt behavior — CONSISTENT for every edit type.** Price, vendor/change, AND lead-time all show the "update
  the matching parts on the other Lines?" prompt when the edited Part# is a known duplicate. Nothing changes on
  another Line without the user confirming. (Resolves the Q1/Q2 split in favor of prompt-for-all.)
- **Index refresh — on BOM save + on project open.** Recompute the stored duplicate index whenever a Line's BOM
  changes structurally (rows added/removed/crossed) and again on project open. Cheap in-memory scan; no manual step.

## FINAL LOCKED DESIGN (F065)
- **Data:** additive project-doc field `crossLineDuplicates` = list of duplicate Part#s (keyed by exact `normPart`)
  with the Lines/rows they appear on. Preserved on save; recomputed on BOM-save + project-open.
- **SSOT predicate:** new `_samePart` (exact `normPart` equality — NOT fuzzy `partMatch`) — one rule, two consumers
  (index builder + edit-time lookup).
- **Trigger:** `updateBomRow` (cell edit: price/leadTime/vendor), `applyConfirmedPrice` (BC confirm-push),
  `commitBcItem` (BC cross). On edit of a Part# present in `crossLineDuplicates` → open a confirm prompt listing the
  other Lines + their current values → user picks (update all / choose / skip).
- **Propagation write:** build `updatedPanels` (all panels), skip `priceSource:"manual"` + `_isExcludedFromPriceCheck`
  rows, run through `_isBomRowFlaggedRed`, persist with ONE `saveProject`. Active project only; capture `projectId`;
  post-await identity re-check on the async BC paths.
- **Guards:** owner-priority gate; sent-quote → will bump quoteRev today (tie to F048 lock when that lands);
  outside the RFQ-only kill-switches (user-driven, confirm-gated) — no new kill-switch needed since it's not silent.

**STATUS:** design LOCKED + build-ready. NOT yet promoted to a TODO.md build item. Money-path → next step = a Marc
build-scope/plan → Coach review → build on Test → Jon verify. Awaiting Jon's go to start the build lane.
