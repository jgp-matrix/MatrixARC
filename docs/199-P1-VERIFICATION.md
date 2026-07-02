# #199 P1 — Coach code verification

**Author:** Sam Wize (Coach) · **Date:** 2026-07-02 · **Type:** CODE verify (read-only), pre-P2 gate
**Commits:** `13f06fcf` (data + capture, inert) + `66494253` (save-hardening) · **Verdict:** **PASS — clear to proceed to P2**, with 1 MED to rule on + LOW notes. Runtime T1–T7 (incl. the T2 save→reload round-trip) remain a live browser pass.

---

## Confirmed correct (verified against code, not just the report)

1. **Predicates at module scope, no premature gate.** `_isUnresolvedTechReviewRow` (`= flag && !resolved`) and `_hasUnresolvedTechReview` sit at 15872–15875, immediately after `_isBomRowFlaggedRed` — the other dual-consumer row predicate (correct home per the CLAUDE.md single-source rule). **`grep` confirms `_hasUnresolvedTechReview` has ZERO call sites** → the P3 send-gate is genuinely not wired yet (P1 is inert). `_isUnresolvedTechReviewRow`'s only consumer is `_hasUnresolvedTechReview` → staged for P3. `_isBomRowFlaggedRed` itself is **unchanged** — TR is not coupled into the red-row logic. ✓

2. **Auto-stamp is SUPPLIER-ONLY** — the plan-drift correction holds. The only auto-stamp is at 38896, inside the **supplier quote-review "Apply"** handler (`quoteReview.matches … action==="apply"`, `crossMode!=="price_only"`, `cross.supplierItem.supplierPartNumber`). The **learning-DB alternates auto-replace at ~10848** (`autoReplace`, `_altRow{…isCrossed:true,autoReplaced:true}`) correctly does **NOT** stamp any TR field — a learning-DB auto-cross is not a supplier substitution and must not arm Tech Review. Verified unstamped. ✓ (24000 priceMap value / 26635 drift are non-issues per the pre-build gate.)

3. **Re-arm semantics.** The supplier stamp sets `resolved:false, resolvedBy:null, resolvedAt:null` unconditionally on (re-)cross → re-crossing a previously-resolved row re-arms it (a fresh substitution needs fresh sign-off). Matches intent. ✓

4. **Reviewer helper is a faithful factor of the cited inline test.** `_isTechReviewer(project)` (15880) vs `isReviewer` @26327 (`_me = _appCtx.uid`): compared term-by-term — `role==="admin"` ‖ `hasPermission("reviewer")` ‖ `preReviewAssignedTo ? ===uid : !!(bcDesignerUid===uid)`. Identical semantics; the helper only **adds** `project&&` null-guards (inline would throw on null project; helper falls to the `bcDesignerUid` branch → `false`). **The P2 repoint of the 26327 site is drift-free.** ✓

5. **Persistence is additive, no migration.** All writes are `{...r, techReview*}` spreads; no `APP_SCHEMA_VERSION` bump. Legacy rows lack the fields → read falsy → treated unflagged. The 5 fields are covered by the Data-Retention §4 preserved-metadata list (commit `8dc2e89a`), so strip-on-save won't drop them. **Code is correct; the runtime T2 round-trip is the live confirmation.** ✓

6. **Save-hardening (`66494253`) is correct.** `try{ Promise.resolve(onSaveImmediate(_u)).catch(()=>{}); }catch(e){}` guards **both** a synchronous throw and the async Firestore-write rejection (a bare try/catch would miss the rejection). House-consistent with the ECO-redirect save pattern. ✓

7. **Indicator is visually distinct (R1).** Amber `TR` / muted `TR✓` glyph + amber `accentColor` checkbox — separate channel from the red price-flag row background. ✓

---

## MED-1 — P1 lets a reviewer CLEAR a supplier flag with no audit stamp (rule this before/at P2)

`_trDisabled = readOnly || _baseLockedInEco || _trResolved || (_trFlagged && _trSupplier && !_trIsReviewer)`. For a **reviewer** on a supplier-flagged, unresolved, editable row, the last term is false → the checkbox is **enabled**. Clicking runs `_onTrToggle` → the supplier-non-reviewer guard (`if(_trFlagged&&_trSupplier&&!_trIsReviewer)return`) does **not** fire for a reviewer → it takes the uncheck branch `{...r, techReviewFlag:false}`.

So in P1 a reviewer can **erase** a supplier TR flag by unchecking — setting `techReviewFlag:false` **without** recording `techReviewResolved/By/At`. But the report scopes the Resolve affordance and all reviewer re-open/resolve interactions to **P2**, and the 5 audit fields exist precisely to record *who* signed off. Net: an un-audited clear on the engineering-sign-off / money path, and the `resolvedBy/At` fields sit unused until P2.

**Recommendation (pick one, Jon-gated):**
- **(a) Preferred for a truly-inert P1:** disable supplier flags for *everyone* in P1 — drop `&&!_trIsReviewer` so `_trSupplier` alone locks the checkbox. Reviewers gain their clear/re-open power in P2 *through the Resolve path* that stamps `resolvedBy/At`.
- **(b) If reviewers must act in P1:** route their action through resolve (`resolved:true, resolvedBy:uid, resolvedAt:now`), not `flag:false`, so the audit trail is preserved.

Not a blocker for the P1 *mechanism*, but it's a policy hole on the audited path — worth closing before the P3 gate makes flag-state load-bearing.

---

## LOW notes

- **L1 — P2 repoint scope.** `_isTechReviewer` equals ONLY the `isReviewer@26327` form. The reviewer tests at **34289–34290** and **37088–37092** include an extra `bcDesignerCode` fallback (`window._arcDesignerCache … .Code`) and are **not** equivalent — do **not** fold those into `_isTechReviewer` in P2 without preserving `bcDesignerCode`, or their behavior changes. Scope the repoint to 26327.
- **L2 — stale source on uncheck.** The manual-uncheck branch clears `techReviewFlag:false` but leaves `techReviewFlagSource` (e.g. `"manual"`) stale. Harmless (source is only meaningful when flag is true), but an optional `techReviewFlagSource:null` on uncheck keeps the row clean.
- **L3 — show-set narrower than red-set.** `_trShow = !isLaborRow && !isContingency`. `_isBomRowFlaggedRed` excludes a larger priceable-set (also customer-supplied / job-buyoff / crate / Matrix-Systems vendor). Confirm TR is *intended* to be flaggable on customer-supplied / Matrix rows; if not, widen the exclusion to match.

---

## Answers to Marc's two design notes

**1. Field-level UI state vs the predicate — SOUND, with one refinement.** Using `_trFlagged/_trResolved/_trSupplier` field reads to drive the checkbox's enable/disable + 3 visual states is correct: the checkbox needs source/resolved granularity the single boolean predicate can't express, and forcing it through the predicate would lose that. The gate concept staying in `_isUnresolvedTechReviewRow` for P3 is right. **BUT** — #199 is the *exact* shape of the CLAUDE.md #175/#178/#179 dual-consumer precedent ("one predicate for BOM row-color AND RFQ eligibility"): a row **indicator** + a send **gate** sharing one rule. To honor that precedent, route the **indicator's unresolved-vs-resolved determination** (amber `TR` vs muted `TR✓`) through `_isUnresolvedTechReviewRow(row)` — that is the shared "unresolved" rule and both consumers (indicator + P3 gate) should call it. Keep the *granularity* reads (supplier vs manual, enable/disable) as raw fields — those are legitimately a separate concern. So: not the whole checkbox, just the unresolved-state visual, through the predicate. Low effort, closes the only spot where the composite rule is currently re-expressed inline.

**2. 56px `_bc` cell density — agree, live-eyeball item.** TR (12px box + ~9px "TR" text + gap) alongside the C and BC 24×24 circles in a 56px cell can exceed width when all three show; `flexShrink:0` on the TR label means it'll wrap or push rather than compress. Not a code defect — verify at a row that shows C + BC + TR simultaneously during the live pass; if it clips, widen the cell or compact the glyph. Added to the T-series live checklist.

---

**Bottom line:** P1 is mechanically correct, supplier-only stamping verified, no premature gate, persistence additive + covered by §4, save hardened. **Clear to proceed to P2.** Close MED-1 (reviewer un-audited clear) as a policy call and note L1 to keep P2's repoint from drifting. Runtime T1–T7 batch when the browser is up.
