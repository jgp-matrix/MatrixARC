# F068 — Propagate the CROSS operation across Lines (FULL-SYNC / Interpretation 2) — BUILD PLAN

**Author:** Marc Masdev (build-scope) · **Reviewed-by:** _pending Coach_ · **Date:** 2026-07-24 · base v1.24.36
**Design:** `docs/F068-CROSSED-SUPERSEDED-ANALYSIS.md` (Int.2 locked; full-sync timing locked by Jon).
**Status:** BUILD-READY pending (a) Jon's Q3 decision + (b) Coach plan review. Money-path (save-path + price-path).

## Behavior
When a user crosses A→B on one Line (`commitBcItem`, `asCross`), AFTER B's async lead-time/vendor lookups land,
**prompt** to apply the same cross to the OTHER Lines still carrying A → turn them into B with the FULL set
(part# + `bcNo` + `isCrossed`/`crossedFrom` + price + lead time + vendor).

## 1. Match targets on the OLD part A
New `PanelCard` helper `_findCrossPropagationTargets(sourceRowId, oldPartA)` — a **dedicated scan of `project.panels`**
(NOT the `crossLineDuplicates` index, which is keyed by CURRENT PN and rebuilds to B after save → timing-fragile).
Match other-Line rows where `_samePartKey(r.partNumber)===_samePartKey(oldA)`, exclude the source row,
`_isExcludedFromPriceCheck` rows, and labor. Rows already carrying B are auto-excluded (their key ≠ key(A)).

## 2. The deferral (full-sync timing)
Fire AFTER B's two fire-and-forget async IIFEs resolve — vendor (`:28462`) + ItemCard lead-time (`:28479`):
- Retain their promises (`_f068VendorP`/`_f068ItemCardP`) instead of discarding — no behavior change to those blocks.
- Hoist a copy of `origPN`→`_f068OldA` to `commitBcItem` scope (currently block-scoped in the `.map` at `:28424`);
  recompute from the pre-commit row.
- Capture `_f068ProjId=projectId`, `_f068PanelId=panel.id` for the Async-Ownership rule.
- After `Promise.allSettled([...])`: re-check identity (`latestPanelRef.current.id===_f068PanelId`; authoritative
  cross-project guard is `capturedProjectId` re-checked inside `propagatePartAcrossPanels` `:40076`/`:40133`), read the
  settled B row from `latestPanelRef.current`, confirm the cross stuck, scan targets, open the prompt.
- Keep the existing F065 price-only fire (`:28542`) for the source row's own B-key duplicates — orthogonal.

## 3. The prompt (explicit — NOT under F067 auto-approve)
New `crossPropPrompt` state + `_maybePromptCrossPropagation` (do NOT reuse `crossLinePrompt` — different semantics).
Patch = `{ ..._fullCrossLinePatch(srcB), crossToPartNumber:srcB.partNumber, bcNo:srcB.bcNo, crossedFrom:oldA,
isCrossed:true }`. New modal (mirrors F065 modal styling `:32455`): title "Part# {A} was crossed to {B} — also cross
it on {N} other Line(s)?"; per-target card with current values + the manual-overwrite + qty-differs amber notes +
the sent-quote revise warning; buttons **[Cross all]** / **[Skip]**. Owner-priority silent-skip guard at top.
**Q3 (Jon):** should F067's 3-min auto-approve ALSO auto-cross? **Marc rec: NO — always prompt** (a silent part#
change across Lines is higher-stakes than a price change). F068 always prompts.

## 4. Extend the propagation write
Extend `propagatePartAcrossPanels` (`:40068`) with an additive **`opts.kind==="cross"`** branch (NOT a sibling fn —
reuse its guards + single `safeSave` + index rebuild; SSOT). **Match on A, write B:** call
`onPropagatePart(oldA, patch, {targetRowIds, sourceRowId, capturedProjectId, kind:"cross"})` so targets (carrying A)
match; inside the row-map (after the vendor block ~`:40113`) additively stamp `partNumber=B, bcNo, isCrossed:true,
crossedFrom:A, bcVerify:{status:"in-bc"}`. Price/LT/vendor already applied by the existing branches from the same
patch. Final `{...row,...rowPatch}` is additive. `buildCrossLineDuplicates` re-derives (B now spans ≥2 Lines).

## 5. Data-safety (CRITICAL — additive)
`{...row,...rowPatch}` preserves ALL target fields (qty, techReview*, ecoTag, customerSupplied, notes, confidence…) —
only part#/bcNo/isCrossed/crossedFrom/bcVerify + price/LT/vendor overlaid. No `delete` of any flag (targets are pure
crosses — do NOT replicate `commitBcItem`'s correction-flag deletes). `_isExcludedFromPriceCheck` targets skipped.
Single whole-doc `safeSave`. Owner-priority guard.

## 6. Learning DB — reuse, don't re-write
The source cross already persisted A→B to `config/alternates` (`saveAlternateEntry(uid,origPN,…,true)` `:28502`),
a **global key = originalPN=A** — covers every future extraction on any project/Line. F068 propagation writes NO
new alternate (redundant + race risk). **Q6 (Jon): reuse — Marc rec (recommended).**

## 7. Edge cases (confirmed)
Target already B → auto-excluded · manual-priced target → cross applies part#, price per Bug-A explicit override
(amber note) · **ECO rows → Q7: include (tag preserved) — Marc rec** · different qty → cross applies, amber note ·
correction (`asCross=false`)/"Just Apply" → never triggers F068 (gated on `asCross && normPart(B)!==normPart(A)`) ·
junk A / cross-didn't-stick → guarded bail.

## 8. Build order · gates · verification
Order: (1) `_findCrossPropagationTargets` (2) hoist origPN + capture promises (3) post-resolve fire block
(4) `crossPropPrompt` + `_maybePromptCrossPropagation` (5) new modal JSX (6) `kind:"cross"` branch (7) wire
[Cross all]. **No new prop plumbing** (`onPropagatePart` already reaches PanelCard). Gates: `validate_jsx.js`,
`check-syntax.sh`, `check-scope.js`, `tools/review.sh` on the diff (money-path). **JSX Fragment Rule** on the new
modal. Test repro: part A on Lines 1+2(+3); cross A→B on Line 1; after LT/vendor land → prompt lists Lines 2/3 →
[Cross all] → they become B with full set, red cleared; verify qty/techReview/ecoTag survive, crosses persist on
reload, one A→B alternate, a *correction* does NOT prompt.

## 9. Decisions (Jon 2026-07-24 — LOCKED)
- **Q3:** F068 **ALWAYS PROMPTS** — the F067 3-min auto-approve does NOT auto-cross (price/LT/vendor still auto-sync).
- **Q6:** reuse the single source A→B `alternates` write (no per-target write). ✅
- **Q7:** include ECO target rows preserving tag — BUT see Coach F5 (skip untagged base targets in ECO-edit mode). ✅

---

## ★ COACH PLAN REVIEW (2026-07-24) — VERDICT: APPROVE-WITH-CHANGES. Build MUST fold in F1–F9.
Spine is correct (match-A/write-B, additive spread, single saveSave, reuse of propagate guards, explicit prompt,
single alternate). Async-ownership guard confirmed **SUFFICIENT** (`capturedProjectId` re-checked at `:40076`/`:40133`
is the authoritative guard; capture it AT COMMIT-TIME and thread unchanged through `crossPropPrompt`→`onPropagatePart`
— do NOT re-read at prompt-open; `panel-1` isn't globally unique so don't rely on the PanelCard panelId check alone).

**★ #3 STALE-FIELD LIST — target fields the additive spread wrongly keeps from OLD part A → the patch MUST update/clear:**
- **F1 [HIGH · money-path] `bcVendorNo`** — `_fullCrossLinePatch` carries `bcVendorName` (label) but NOT `bcVendorNo` →
  crossed target reads name-B / number-A (breaks PO vendor routing `:6630`/`:16097`; the documented defect at `:7153`).
  **Fix:** set `bcVendorNo` from the settled `srcB` (or explicitly clear both vendor fields so pricing re-resolves) +
  confirm the PO-push path re-resolves, not just RFQ. **Do not ship name-B/number-A rows.**
- **F2 [MED] `manufacturer`** — not in the patch; target keeps A's manufacturer. Add `manufacturer` from settled B.
- **F7 [LOW] correction flags** — if a target was itself a prior correction it carries `isCorrection/correctionType/
  correctionFrom`; the spread yields dual cross+correction state. **Clear those on cross targets (mirror `:28469`).**
- *(already in patch — verify present):* `bcNo`, `bcVerify→in-bc`, `priceSource→bc`, `priceDate`/`bcPoDate`,
  `confidence→high`+drop `_confDowngradeReason` (propagate `:40119`). *(low-pri edge):* stale `bcFuzzySuggestions`/
  `suggestedPartNumber` for A.

**★ Other required changes:**
- **F3 [MED · gate] Gate on the SETTLED row, not raw `asCross`.** `skipLearning` takes precedence and deletes the cross
  flags even when `asCross===true` (`:28465`). Gate F068 on the committed row's `isCrossed===true && crossedFrom===oldA`
  (the "confirm the cross stuck" step) — robustly excludes "Just Apply" + corrections.
- **F4 [MED · WOULD NO-OP THE FEATURE] `[Cross all]` MUST pass `oldA`.** F065's modal passes the source's CURRENT PN
  (=B here) → keys on B → matches no targets → silent no-op. Store `editedPartNumber=oldA` in `crossPropPrompt` and call
  `onPropagatePart(oldA, patch, {…,kind:"cross"})`. **Explicit divergence from the F065 modal pattern — do not copy-paste it.**
- **F5 [MED · ECO integrity] `propagatePartAcrossPanels` bypasses `_redirectEditToEco`** — for a part# mutation on a base
  row while `_isEcoEditMode`, a base row that should become an ECO 'modify' delta would get its part# swapped in place.
  **Skip untagged base targets when `_isEcoEditMode`** (or route through the delta model). Sharpens Q7.
- **F6 [LOW-MED · order] Stamp the cross fields BEFORE the empty-patch bail** (`:40114` `if(Object.keys(rowPatch).length===0)return row;`)
  — a price-less BC cross yields an empty patch and would skip the row. Put the `kind:"cross"` stamping before that guard.
- **F8 [LOW] Conditional vendor-IIFE promise** — the vendor IIFE fires only `if(!updates.bcVendorName&&newPN)`; when it
  doesn't, `_f068VendorP` must be a resolved promise so `Promise.allSettled` isn't handed `undefined`.
- **F9 [LOW · cosmetic] `bcSyncErrors[targetRowId]`** stale on targets (parent-scope propagate doesn't clear it). Accept or clear.

**Coach confirmed correct (no change):** promise-retaining the two IIFEs (their read-map-write tails are synchronous/
atomic — no lost update; the settled B row carries both LT+vendor) · match-A/write-B no self-collision · single alternate
reuse · createPortal sibling = no Fragment-Rule risk · the OTHER `isCrossed=true` sites (alternates auto-replace `:11806`/
`:25679`, portal apply `:41727`/`:40831`) are BULK paths that cross all Lines at once → self-sync, need no propagation
(state this so scoping is auditable). Preserve list (qty/techReview*/ecoTag/customerSupplied/notes/confidence/…) correct.

**Bottom line (Coach):** land F1–F5 (esp. F1 vendor-number + F4 pass-oldA) then it's build-ready for the money-path lane.
