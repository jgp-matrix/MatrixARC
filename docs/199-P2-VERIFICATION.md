# #199 P2 — Coach code verification

**Author:** Sam Wize (Coach) · **Date:** 2026-07-02 · **Type:** CODE verify (read-only), pre-P3 gate
**Commit:** `a5253d42` · **Verdict:** **PASS — clear to P3** (on Freddy's GO), with 1 MED on the approve error-path + 2 LOW. Runtime T8–T12 batch with P1's T1–T7 at the browser pass.

---

## Verified correct (against code)

1. **MED-1 fix — supplier flags disabled for EVERYONE.** `_trDisabled` dropped the `&& !_trIsReviewer` term → now `…||(_trFlagged && _trSupplier)`. A supplier-flagged row's checkbox is disabled for Sales AND reviewers; `_onTrToggle`'s leading `if(_trDisabled)return` then blocks any toggle. **The only path that clears a supplier flag is `_onTrResolve` (audited).** MED-1 correctly closed. ✓

2. **Indicator routed through the predicate.** Badge now reads `_trUnresolved = _isUnresolvedTechReviewRow(row)` for both color (`amber : muted`) and glyph (`"TR" : "TR✓"`). The last inline `flag && !resolved` re-expression is gone — row indicator and the P3 gate now share the one predicate (the #175/#178/#179 dual-consumer shape). ✓

3. **`_isTechReviewer` repoint — no drift.** The inline `_me`/`isReviewer` expression at `_trackBomChange` (the 26327 site I verified term-for-term in P1) is replaced by `_isTechReviewer(project)`. **L1 honored:** the two `bcDesignerCode`-fallback sites (34289–34290 / 37088–37092) are left inline (diff doesn't touch them) — they carry a fallback the helper lacks, so leaving them is correct, not a regression. ✓

4. **Per-row Resolve — reviewer-only, audited, persisted.** `_onTrResolve`: `if(!_trIsReviewer || !_trUnresolved) return;` → reviewer-gated and only on unresolved rows. Stamps `techReviewResolved:true, techReviewResolvedBy:_appCtx.uid, techReviewResolvedAt:Date.now()` via additive spread (preserves `techReviewFlag:true` + source for the audit trail). Persists `latestPanelRef → onUpdate → onSaveImmediate` with the same `Promise.resolve(...).catch()` + outer try/catch guard as P1. Button renders only when `_trShow && _trUnresolved && _trIsReviewer` (double-guarded vs the handler). ✓

5. **Approve-sweep — resolves all unresolved across all panels.** At pre-review approve: maps panels, and for any panel with `.some(_isUnresolvedTechReviewRow)` rebuilds its bom stamping `resolved/By/At` on each unresolved flagged row; unchanged panels return the same reference, so `_trChangedPanels = filter(p !== original[i])` persists **only** genuinely-changed panels. Persisted via `saveProjectPanel(uid, project.id, _p.id, _p, true)` — the `true` is `skipNotify` (correct 5th param; dataUrl-strip + cross-user guards run inside). `reviewFields` scalar `.update()` path unchanged. Attribution uses `_appCtx.uid` (actor) for `resolvedBy`; `uid` (path-owner) for the save path — both correct for their roles. ✓ *(see MED-2 for the error-path caveat)*

6. **L3 show-set decision — SOUND, CONCUR.** `_trShow = !isLaborRow && !isContingency` (broader than the red priceable-set). Confirmed the show-set **covers the entire @38896 supplier auto-stamp domain**: the stamp fires only on `quoteReview` cross matches (`action==="apply" && isVariance && crossMode!=="price_only"`, matched by `bomRowId`) — i.e. real, quotable part rows. Labor and contingency rows (the only ones `_trShow` excludes) have no part number and can't be supplier-crossed, so the auto-stamp can never land a flag on a hidden row. Manual flags are only settable on a `_trShow` row to begin with. **∴ no flag can exist on a non-shown, un-resolvable row → no permanent P3 send-block with no clear path.** The dead-end guard holds (R2 spirit). ✓

---

## MED-2 — Approve-sweep persists swept panels even when the approval scalar write FAILED (error-path partial write)

Structure at the pre-review approve:
```
onUpdate({...project, ...reviewFields, panels:_trSweptPanels});     // optimistic local
try { await fbDb…doc(project.id).update(reviewFields); }
catch(e){ console.error(…); onUpdate({...project}); }               // revert UI on scalar fail
for (const _p of _trChangedPanels){ try{ await saveProjectPanel(uid,project.id,_p.id,_p,true);}catch(e){…} }  // ALWAYS runs
```
If the scalar `reviewFields` write throws (network/permission), the catch reverts local state to `{...project}` (unapproved, flags unresolved in memory) — **but the panel-save loop still runs unconditionally**, writing the resolved-flag panels to Firestore. Result: **Firestore ends with `techReviewResolved:true` rows on a project whose `preReviewStatus` was NOT persisted as approved.** On reload the project reads back *unapproved but with its TR flags resolved*.

Why it matters on this path: once P3's send-gate keys on `_hasUnresolvedTechReview`, a project that *failed* approval but got swept would read "no unresolved flags" → potentially **sendable without the approval that justified the resolve** (unless P3 also gates on approval status — a P3 composition question either way). The resolve stamps still carry `resolvedBy/At`, so it's not silent, but the approval↔resolution coupling is broken on the error path.

**Recommendation (low-cost):** gate the panel sweep-persist on the scalar update succeeding — move the `for` loop inside the `try` after the `await update`, or set `let approved=true` and flip it in the catch, then `if(approved) for(…)`. Keeps the sweep atomic with the approval it represents.

---

## LOW

- **L4 — dead secondary guard in `_onTrToggle`.** Post-MED-1, `_trDisabled` already includes `_trFlagged && _trSupplier`, so `_onTrToggle`'s leading `if(_trDisabled)return` blocks all supplier toggles; the later `if(_trFlagged&&_trSupplier&&!_trIsReviewer)return;` is now unreachable and its comment ("not clearable by Sales") is stale (it's now everyone). Simplify to `if(_trFlagged&&_trSupplier)return;` or drop it, and refresh the comment. Harmless as-is.
- **L5 (carry to P3) — approve-path coverage.** The sweep lives at the **pre-review** approve. For P3, confirm every send/quote path that the gate protects either (a) passes through this pre-review approve-sweep, or (b) leaves per-row Resolve as a reachable clear affordance — so no send path can be gate-blocked with nothing to click. (Post-review approve, or a send that skips pre-review, should be checked when the gate lands.)

---

**Bottom line:** P2 is correct — MED-1 closed, indicator/predicate unified, reviewer-only audited Resolve, approve-sweep scoped to changed panels via the proper panel save, L3 dead-end guard sound. **Clear to P3.** Fix or consciously accept **MED-2** (approve error-path partial write) and carry **L5** into the P3 gate verification. Runtime T8–T12 at the live pass.
