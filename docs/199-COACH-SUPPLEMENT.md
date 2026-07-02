# #199 — Per-Line "Tech Review" Flag — COACH SUPPLEMENT

**Author:** Sam Wize (Coach) · **Date:** 2026-07-02 · **Type:** Code-verification supplement (read-only, no build)
**Base version:** v1.21.23 · master `03ae8ee6`
**Responds to:** `docs/199-TECH-REVIEW-FLAG-BRIEF.md` §7 (Q1–Q5) + §5 predicate sanity-check
**Verdict:** **FEASIBLE.** Clean single-site auto-check, a proven multi-site gate choke point, and additive persistence that survives save + reconciliation. Three product decisions surfaced for Freddy's Analyst Review (all in §Q3).

---

## Executive summary

| Q | Answer | Confidence |
|---|--------|-----------|
| Q1 supplier-cross signal | **No existing field distinguishes a supplier cross from a manual cross.** Both set only `isCrossed`+`crossedFrom`; only the learning-DB cross adds `autoReplaced:true`. BUT the supplier cross lands on the BOM row at exactly **ONE site** (`src/app.jsx:38801`, the variance-review "Apply … to BOM" button). Stamp the auto-flag there at creation — no retroactive provenance detection needed. | HIGH (traced) |
| Q2 gate choke point | Model the hard gate on **`findIncompleteQuoteItems(project)`** (line 15900), the shared send-block predicate already called at **6 send/print sites**. Do NOT model it on the single-site `preReviewStatus` gate (line 35875 only). | HIGH (traced) |
| Q3 resolution | Existing model best supports a **hybrid**: per-item `techReviewResolved` set by the reviewer in the Tech-Review view, PLUS a safety sweep at project approve (line 34231). Sales-can't-uncheck-supplier is feasible via `techReviewFlagSource`. 3 product decisions for Freddy. | HIGH (traced) |
| Q4 persistence | **Additive, no schema bump.** `saveProject`/`saveProjectPanel` spread the whole project object; only `dataUrl` is stripped. New row fields ride along automatically. | HIGH (traced) |
| Q5 reconciliation survival | Flag **survives** on unchanged / qty-changed / rejected rows (`carryUnchanged` spreads `{...prior}`; new fields are NOT in `NO_CARRY`). Dropped only on **`pn_changed`-accept** — which is correct: the supplier cross itself is dropped there too. Flag rides the exact lifecycle of `isCrossed`. | HIGH (traced) |

§5 `_hasUnresolvedTechReview` predicate: **sound and required** by the dual-consumer rule — with one refinement (factor into a row-level rule + a project rollup; see §5-review).

---

## Q1 (BLOCKING) — the supplier-cross signal

**Finding: there is NO row field today that uniquely identifies a supplier-originated cross.** All three cross provenances converge on the same two fields:

| Cross provenance | Site | Fields set on the BOM row |
|---|---|---|
| **Learning-DB auto-cross** | `app.jsx:10848`, `:24000` | `isCrossed:true, crossedFrom:pn, autoReplaced:true, priceSource:"bc"` |
| **Manual cross** (BC Item Browser) | `app.jsx:26635` | `isCrossed:true, crossedFrom:origPN` (no `autoReplaced`) |
| **Supplier cross** (RFQ variance apply) | `app.jsx:38801` | `isCrossed:true, crossedFrom:cross.bomPartNumber, partNumber:supplierPN` (no `autoReplaced`) |

So supplier and manual crosses are **currently indistinguishable** by row fields. `autoReplaced:true` separates only the learning-DB path. Freddy's §3 read is confirmed.

**Why this is not a blocker — the single choke point.** The supplier cross reaches the BOM row in exactly one place:

```js
// app.jsx:38792  variance-review "Apply … Items to BOM" button
const crosses = toApply.filter(m => m.isVariance && m.crossMode !== "price_only");
if (crosses.length > 0) {
  const updatedPanels = (projectRef.current.panels||[]).map(p => ({...p, bom:(p.bom||[]).map(r => {
    const cross = crosses.find(c => c.bomRowId === r.id);
    if (cross) return {...r, partNumber: cross.supplierItem.supplierPartNumber||cross.supplierItem.partNumber,
                       crossedFrom: cross.bomPartNumber, isCrossed:true};   // ← line 38801: stamp the auto-flag HERE
    return r;
  })}));
  update({...projectRef.current, panels:updatedPanels});
}
```

**Recommendation:** stamp `techReviewFlag:true, techReviewFlagSource:"supplier"` on the row at line 38801, at the moment the cross is created. This is deterministic and requires zero provenance inference on existing data.

**Two corroborating facts that keep this to one site:**

1. **The main `doApplyPortalPrices` path does NOT cross the BOM row.** For crossed items it *skips* the row (line 38096, `crossedPNs.has(nk)` → returns the row unchanged apart from a lead-time patch) and pushes the price to the supplier's PN in BC only. The row's `partNumber` stays the original. So no auto-flag logic belongs in `doApplyPortalPrices` — the row-level cross only happens via the variance-review button above.
2. **`supplierCrossRef` is never auto-applied.** It is WRITTEN at `app.jsx:19425` and READ only in the Reports modal (`app.jsx:42799`) for display. Unlike the `alternates` learning DB (which auto-applies via `applyLearnedCorrections` on every extraction), `supplierCrossRef` does not re-cross rows on load or extract. So there is no second, hidden supplier-cross site to instrument.

**Net Q1:** one deterministic auto-check site (38801); no back-fill or heuristic needed; provenance is captured going forward via the new `techReviewFlagSource` field.

---

## Q2 — the hard-gate choke point

**Two candidate gates exist; they are not the same reach:**

- **`preReviewStatus` gate** — appears at **exactly one site**, line 35875 (the ProjectView print/send button):
  ```js
  if (project.preReviewStatus && project.preReviewStatus !== "approved") { arcAlert("Engineering approval required…"); return; }
  ```
  Layering #199 here would cover only that one button. **Insufficient for a HARD GATE.**

- **`findIncompleteQuoteItems(project)`** (defined line 15900) — the shared send-block predicate, already called at **6 send/print surfaces**:
  | Site | Surface |
  |---|---|
  | 32876 | QuoteSendModal (`incompleteItems`) |
  | 33537 | QuoteSendModal verify-block filter |
  | 35847 | ProjectView send button (`_incompleteItems` → `_sendBlocked`) |
  | 37540/37542 | Print path (`_printIssues`) |
  | 38536 | Inline send path |

  This is the money-path choke ARC already uses for missing-price/verification blocks (`_sendBlocked = _incompleteItems.length > 0`, line 35851).

**Recommendation:** the hard gate belongs on the `findIncompleteQuoteItems` pipeline, NOT the `preReviewStatus` site. Two viable shapes for the Detailed Plan (Freddy/Jon choose):

- **(A) Extend `findIncompleteQuoteItems`** to emit a synthetic "incomplete item" per unresolved Tech-Review row (e.g. `{isTechReviewBlock:true, …}`). Zero new call sites — all 6 surfaces inherit the block, the button auto-disables, the banner renders. Cleanest.
- **(B) Add a parallel `_hasUnresolvedTechReview(project)` guard** called at the same 6 sites. More explicit, but 6 edit points and easy to under-cover a future 7th send path.

I lean **(A)** — it rides the existing plumbing and cannot be forgotten on a new send path, matching the `_hasPrice`/`_isValidPrice` "factor the rule" precedent (CLAUDE.md).

**Relationship to `preReviewStatus` (Freddy's explicit sub-question):** they compose cleanly and are NOT redundant. `_hasUnresolvedTechReview` blocks send *until the flagged lines are cleared*; `preReviewStatus` blocks send *until the project-level review is approved*. In the intended flow the flag is what *drives the user into* the review, and review-approval is what *clears the flag* (see Q3). Keep both — they gate different preconditions.

---

## Q3 — resolution mechanics

**Existing review data model (all project-level, no per-row dimension today):**
- "Send for Technical Review" → `preReviewStatus:"pending"`, resets `reviewChangeLog:[]` (line 34367–34369).
- Approve → `preReviewStatus:"approved"`, `preReviewApprovedAt/By`, resets `reviewChangeLog:[]` (line 34231).
- Return → `preReviewStatus:"rejected"`, `preReviewNotes` (line 34246).
- `reviewChangeLog` is a project-level array tracking **BOM changes during review** — not flag resolution.

**What the model best supports (recommendation): a hybrid.**
1. **Per-item resolution (primary)** — add `techReviewResolved:true` (+ `techReviewResolvedBy/At`) set when the reviewer clears an item in the Tech-Review view. This is precise and matches Brief §4.5 ("surface flagged lines … and can resolve them"). Requires a per-row resolve control in the review surface (new UI, but small).
2. **Approve-sweep safety net (secondary)** — at the project-approve action (line 34231), sweep any still-flagged rows to `techReviewResolved:true`. This guarantees an approved project can never be permanently un-sendable because of a stray unresolved flag, and reuses the existing approve write path (which already resets `reviewChangeLog:[]`).

I'd avoid *pure* Option (b) (clear-all-on-approve with no per-item control): it silently clears flags the engineer may never have looked at, which weakens the audit value of the flag.

**Product decisions for Freddy's Analyst Review (all feasible; Jon owns the call):**
- **P1 — Can Sales uncheck a supplier auto-flag?** Freddy's lean (supplier flags clear only via review; manual flags Sales toggles freely) is **feasible and I concur**. Gate the checkbox `onChange` on `techReviewFlagSource !== "supplier" || isReviewer`. This preserves gate integrity — Sales cannot uncheck their way past a supplier substitution.
- **P2 — Does approve clear ALL flags or only reviewed ones?** Drives whether the approve-sweep (item 2 above) is in-scope for #199 or deferred. Recommend in-scope (cheap, prevents a dead-end state).
- **P3 — Manual-flag re-raise after resolution?** If a reviewer resolves a manual flag and Sales re-checks it, does it re-block? (Yes under the row-level predicate — `techReviewFlag && !techReviewResolved` — re-checking would need to also clear `techReviewResolved`. One-line consideration for the plan.)

---

## Q4 — field persistence

**Confirmed additive; no `APP_SCHEMA_VERSION` bump.**

`saveProject` (line 8898): `const data = {...project, id, updatedAt, schemaVersion:APP_SCHEMA_VERSION, …}` — spreads the entire project (panels → bom rows) verbatim. The only field ever stripped on the persistence path is `dataUrl` (line 9641, page-level, 1 MB limit). BOM rows are **not** field-whitelisted — arbitrary additive row fields round-trip. `saveProjectPanel` (line 9224) follows the same whole-object spread.

Per CLAUDE.md Data-Retention rule #4 ("Only strip `dataUrl` on Firestore save… All metadata flags … must be preserved"), the new fields join `isCrossed`, `priceSource`, `leadTimeSource`, etc. as preserved metadata by default. `schemaVersion` is *stamped* on every save but a bump is only required for **breaking/migration** changes — additive optional fields (absent on legacy rows, read as falsy) need none. The `_hasUnresolvedTechReview` predicate treats missing fields as "not flagged," so legacy projects are safe with no migration code.

**One plan note:** add `techReviewFlag` / `techReviewFlagSource` / `techReviewResolved*` to the CLAUDE.md "preserved-metadata set" list (documentation only — the save path already preserves them mechanically).

---

## Q5 — survival across #153 reconciliation re-extract

**`reconcileBom` (line 47774) carry mechanics for the new fields:**

| Match class | Carry fn | Behavior for `techReview*` |
|---|---|---|
| **unchanged** | `carryUnchanged` (47879) — `{...prior, …coords}`, then `NO_CARRY.forEach(delete)` | **PRESERVED.** `NO_CARRY` = `['confidence','_confDowngradeReason','suspectQty','suspectQtyReason','autoAddedCompanion','companionOfPartNumber','snippetCorrected','additionalPartNumbers']` — the new fields are NOT listed. |
| **changed / qty-same** | `carryChangedPnSame` (47884) — builds on `carryUnchanged` | **PRESERVED.** |
| **changed / pn_changed (accepted)** | `carryChangedPnChanged` (47890) — fresh object, ~8 whitelisted fields only | **DROPPED** — and correctly so (see below). |
| **changed (rejected)** | `{...m.prior}` (47910) | **PRESERVED.** |
| **added (new row)** | `buildNewRow` (47897) — fresh object | Absent (correct — not yet crossed). |
| **kept-deleted** | `keptDeleted.push(r)` (per C164) | **PRESERVED.** |

**Answer to "should a supplier-crossed row retain its flag across re-extract?":** Yes — and it does, in every case where the supplier cross *itself* is retained. The flag rides the exact lifecycle of `isCrossed`/`crossedFrom`:

- The C103 **cross-aware pre-pass** (line 47817, runs before Pass 1) matches crossed prior rows by `normPart(crossedFrom)` against the new extraction's `normPart(partNumber)`. A supplier-crossed row whose underlying drawing PN is unchanged routes to **unchanged** → `carryUnchanged` → flag preserved.
- Only a **genuine drawing-PN change** falls through to Pass 2 → `pn_changed`. There, `carryChangedPnChanged` drops both the cross AND the flag. This is the correct outcome: the drawing now specifies a different part, so the prior supplier substitution — and its Tech-Review obligation — no longer apply. If the supplier crosses the *new* part later, line 38801 re-stamps a fresh flag.

**Net Q5:** no `NO_CARRY` change needed; no special reconciliation handling required. The flag survives iff the cross survives — a consistent, defensible rule.

---

## §5 predicate sanity-check (dual-consumer rule) — VALIDATED with a refinement

Freddy's `_hasUnresolvedTechReview` proposal is **required** by the CLAUDE.md "Single Source of Truth for Dual-Consumer Predicates" rule — the flag drives both a row-level indicator and a project-level send gate, so the RULE must be factored once. This is the same pattern as `_hasFirmLeadTime` (#175) and `_isValidPrice`/`_isValidLT` (#179).

**Refinement — factor at two altitudes, one rule:** the two consumers read at different scopes (the gate is project-wide; the checkbox/indicator is per-row). Define the row rule once and roll it up:

```js
// ONE rule for "counts as an unresolved tech-review item":
const _isUnresolvedTechReviewRow = r => !!r.techReviewFlag && !r.techReviewResolved;

// Project rollup — defined IN TERMS OF the row rule (the gate consumer):
const _hasUnresolvedTechReview = project =>
  (project.panels||[]).some(p => (p.bom||[]).some(_isUnresolvedTechReviewRow));
```

The row checkbox/indicator calls `_isUnresolvedTechReviewRow(r)`; the hard gate (via Q2 option A/B) calls `_hasUnresolvedTechReview(project)`. "What counts as unresolved" then lives in exactly one function and cannot drift between the visual and the block — mirroring `_hasPrice(r)` (row) rolled up per-panel in #178. Recommend the Detailed Plan adopt this two-tier factoring rather than inlining `techReviewFlag && !techReviewResolved` at each site.

---

## Feasibility verdict & recommended pipeline

**FEASIBLE — full pipeline warranted (touches the money/send path).**

- **Auto-check:** 1 deterministic site (38801). No back-fill.
- **Hard gate:** ride `findIncompleteQuoteItems` (6 surfaces, zero-new-call-site option A).
- **Resolution:** hybrid per-item + approve-sweep; reuses existing approve write path.
- **Persistence:** additive, no schema bump, survives save.
- **Reconciliation:** rides `isCrossed` lifecycle; no `NO_CARRY` change.

**Open items for Freddy's Analyst Review before the Detailed Plan:** P1 (Sales uncheck supplier flag — I concur with your lean), P2 (approve clears all vs reviewed-only — recommend in-scope sweep), P3 (manual-flag re-raise semantics). Plus: pick Q2 gate shape (A extend `findIncompleteQuoteItems` vs B parallel guard — I lean A).

**Next in pipeline:** Freddy Analyst Review (resolve P1–P3 + finalize field model) → Coach Detailed Plan (phased, with test criteria) → Marc implements.
