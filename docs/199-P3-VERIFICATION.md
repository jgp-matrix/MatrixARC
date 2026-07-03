# #199 P3 — Coach code verification (FINAL / money-path gate)

**Author:** Sam Wize (Coach) · **Date:** 2026-07-02 · **Type:** CODE verify (read-only), final gate before code-complete
**Commit:** `a0e39335` · **Verdict:** **PASS on the built scope — gate is correct** — with **2 findings to rule on before deploy** (MED-3 BOM-send bypass; MED-4 approved-state message). Runtime T1–T17 at Jon's live pass.

---

## Requested items — all CONFIRMED

1. **Gate synthetic issue.** In `findIncompleteQuoteItems`, inside the per-panel loop (loop vars verified: `bom=pan.bom||[]`, `pan`, `pi` — same ones the existing pricing/verify pushes use), `bom.filter(_isUnresolvedTechReviewRow)` → pushes one `{isTechReviewBlock:true,count}` issue per panel with unresolved rows. `_sendBlocked = incompleteItems.length>0` then trips automatically — **zero new call sites.** ✓

2. **3-way split fixes the miscategorization.** `formatIncompleteQuoteAlert` was `pricingIssues = filter(!isVerificationBlock)` → TR (not a verification block) fell into pricing. Now: `verify = isVerificationBlock`, `techReview = isTechReviewBlock`, `pricing = !isVerificationBlock && !isTechReviewBlock`. ✓

3. **T14 — every pricing-bucket split site is now TR-aware.** Enumerated all `isVerificationBlock` uses. The **four** sites that define the "pricing" bucket by exclusion all now also exclude `isTechReviewBlock`: `15989` (alert), `33021` (QuoteSendModal), `36008` (ProjectView banner), `37705` (print). Positive-filter sites (`15987/33018/36005/37703`) don't need it. **No surface still mislabels TR as pricing.** (One exception surfaced separately — see MED-3, `33680`, which is a *different* standalone gate, not a mislabel.) ✓

4. **Distinct message + print stays soft.** TR message present and distinct ("N line(s) require Technical Review sign-off … Click 'Send for Technical Review', or have an engineer resolve"). Print path (`~37701`) uses `arcConfirm(…, {okLabel:"Print Anyway"})` — soft warning, TR line added to the message; send paths hard-disable. **Send hard-blocks / print soft-warns — confirmed intended and consistent with the existing verify/pricing behavior.** ✓

5. **MED-2 FIXED (re-confirmed in context).** `let _trApproveOk=false; try{…update(reviewFields);_trApproveOk=true;}catch{…}` then `if(_trApproveOk){ for(_p of _trChangedPanels) saveProjectPanel(…) }`. The swept panels persist **only** when the approval scalar write succeeded → no resolved-flags-on-unapproved-project partial write. Hole closed exactly as recommended. ✓

6. **L4 FIXED.** The dead secondary guard in `_onTrToggle` is removed; the leading `if(_trDisabled)return` remains, and `_trDisabled` still includes `(_trFlagged && _trSupplier)` (P2) → Sales can't clear supplier flags via the checkbox; only the audited Resolve clears them. ✓

7. **L5 — no hard dead-end: CONFIRMED.** "Send for Tech. Review" (button `~35997`, action `~34524` sets `preReviewStatus:"pending"`) is **not** gated by `_sendBlocked`, so Sales can always route a blocked quote to review; reviewer per-row Resolve and the approve-sweep are always reachable. No hard dead-end. ✓ *(But see MED-4 for the approved-state wrinkle.)*

---

## MED-3 (NEW — potential gate BYPASS on a customer-facing send; confirm vs plan scope)

`handleBomSend` (standalone Quoted-BOM customer-review send, `~33680`) computes its own gate: `findIncompleteQuoteItems(project).filter(i=>i.isVerificationBlock)` — **verification blocks only.** It does **not** consult `isTechReviewBlock` (nor pricing, by design). So a BOM carrying an **un-signed-off supplier substitution** (unresolved TR) can be sent to the customer via "Send Quoted BOM," **bypassing the #199 gate.**

This is a *separate* path from the 6 `_sendBlocked` surfaces (which correctly include TR via `length>0`), so the "all 6 surfaces / zero new call sites" claim is still true — but this 7th send surface sits outside it. TR exists specifically to hold un-reviewed substitutions from going out; a customer-facing BOM send emitting one seems in-scope for the gate.

**Action:** confirm against `docs/199-DETAILED-PLAN.md §4` surface list — is the standalone Quoted-BOM send **intentionally** out of the TR gate (it's a review send, not a quote/order), or should it block on unresolved TR? If the latter, add `|| i.isTechReviewBlock` (or a TR-specific block) to the `~33680` check — a one-line fix. **Rule this before deploy** since it's a customer-facing money/scope path.

---

## MED-4 (NEW — approved-state re-arm: block message points to a button that isn't there)

Definitive trace of Freddy's re-arm nuance. The review-status block (`~35983`) renders by `preReviewStatus`:
- **`"approved"`** → "✓ Pre-Review Approved" + a **Cancel** button (+ Rv.Hist). **The "Send for Tech. Review" button is NOT rendered here** — it only renders when status is null/returned.
- `"pending"` → "In Pre-Review — awaiting approval".
- else → the "Send for Tech. Review" button.

So on a **post-approval re-arm** (a new supplier cross re-flags a line on an already-approved project → `_sendBlocked` trips):
- **Reviewer**: per-row Resolve renders on the row → resolves it. ✓ (Correct: a new substitution *should* need fresh engineer sign-off — the gate firing is right.)
- **Sales (non-reviewer)**: no per-row Resolve (reviewer-only), and **no "Send for Tech. Review" button** in the approved state. Their only self-service lever is **Cancel** (which *discards the approval* to expose the re-submit) — clunky and destructive.
- Meanwhile the send-block message tells them to *"Click 'Send for Technical Review'"* — **a button that doesn't exist in the approved state.** Misleading guidance.

**No hard dead-end** (reviewer/admin Resolve always works; Sales can Cancel→re-submit) — so Marc's "no dead-end" holds. But two UX gaps: (1) the message references a missing control; (2) Sales must cancel a valid approval to re-route.

**Opinion (Freddy's Q):** **Acceptable to SHIP as-is** — the gate behavior is correct and safe (re-arm rightly forces fresh sign-off), and there's no dead-end. **Log a small follow-up** (not a P3 blocker): in the blocked+approved state, either (a) surface a "Send for Tech. Review / re-submit" affordance beside the approved banner, or (b) make the block message state-aware — when approved, say "have an engineer **Resolve** the flagged line(s)" and drop the Send-for-Tech-Review instruction that doesn't apply. Option (b) is the cheaper honesty fix.

---

## Bottom line
The P3 hard gate is **mechanically correct**: synthetic issue rides the existing `_sendBlocked` on all 6 quote surfaces, the 3-way split fix is complete (T14), distinct messaging, print soft / send hard, and the two P2 follow-ups (MED-2, L4) are properly closed. **PASS on the built scope.** Before deploy, **rule MED-3** (BOM-send TR bypass — confirm intended or one-line add) and **log MED-4** (approved-state message accuracy — ship-acceptable, small follow-up). Then live T1–T17.

---

## MED-3 FIX RE-VERIFY (2026-07-02, commit `c46184aa`) — PASS

Jon ruled "gate it." `handleBomSend` (`~33684`) now adds, immediately after the `verifyBlocks` check, a mirrored TR gate:
```
const trBlocks=findIncompleteQuoteItems(project).filter(i=>i.isTechReviewBlock);
if(trBlocks.length){ const _trN=trBlocks.reduce((s,i)=>s+(i.count||1),0);
  arcAlert("Quoted BOM send blocked — "+_trN+" line…require Technical Review sign-off…
            Have an engineer resolve the flagged lines (or approve the project), then resend."); return; }
```
- **Mirrors correctly** — same `findIncompleteQuoteItems(project).filter(...)` → `.length` → `arcAlert` + early `return` shape as the `isVerificationBlock` gate directly above; placed before recipient validation and before `setBomSending(true)` (early-return, no in-flight-guard leak). ✓
- **Predicate + count correct** — `isTechReviewBlock` filter, `reduce(count||1)` sum (consistent with the other P3 TR counts). ✓
- **Message right — and MED-4-safe:** it directs "have an engineer resolve the flagged lines (or approve the project)" rather than "Click Send for Technical Review," so it does **not** reproduce the MED-4 absent-button phrasing on this surface. ✓
- **No new dead-end** — resolution is the same reachable reviewer Resolve / approve-sweep. ✓
- **Optional trivial nit (non-blocking):** two `findIncompleteQuoteItems(project)` calls now in `handleBomSend` (verify + TR); could compute once and filter twice. Harmless (send-click, not hot path) and matches the existing style — no change needed.

**#199 is now FULLY code-complete — all 7 customer-facing surfaces gated on unresolved Tech Review.** Clear to live T1–T18 → deploy. MED-4 remains the logged LOW follow-up.

---

## COUNT-FIX RE-VERIFY (2026-07-02, commit `107b960b`) — PASS

Live-acceptance bug (Jon): with >1 line flagged, the Send-button label + QuoteSendModal titles showed "1 incomplete" regardless of count. Root cause: the P3 gate pushed **one issue per PANEL** (`count:N`), but the `.length`-based displays read the issue-object count = 1/panel. Fix pushes **one issue per unresolved TR row** (matches the pricing per-row pattern), dropping the `count` field.

- **(a) Per-row push correct, no double-count / no pricing disturbance** — `for(const _trRow of bom.filter(_isUnresolvedTechReviewRow)){ issues.push({… isTechReviewBlock:true}) }` at `src/app.jsx:15963-15982`: one issue per unresolved row, each pushed once; separate from the untouched pricing loop above it. ✓
- **(b) `.length` displays now agree** — modal Send-button titles (`33367`/`33375`, `incompleteItems.length`), modal pagination (`33356`, `incompleteItems.length-8`), ProjectView Send-button label (`36086`, `_incompleteItems.length`) now count N per-row issues instead of 1/panel → true flagged-line count. The 5 sum sites (`15997`/`33020`/`33693`/`36019`/`37718`) all use `count||1` → per-row (no `count`) contributes 1 each → sum still = N. No site reads a raw `.count`, so dropping the field is safe. ✓
- **(c) Gate unchanged** — `_sendBlocked = findIncompleteQuoteItems(...).length>0` still trips iff ≥1 unresolved TR row; `.some(i=>i.isTechReviewBlock)` still true iff any. ✓
- **(d) No pricing regression** — diff touches only the TR block; pricing loop untouched; `_pricingIssueCount` filters out `isTechReviewBlock` (`33021`/`36020`) so it's unaffected. ✓

**Minor, non-blocking (intended):** a row that is *both* pricing-incomplete *and* TR-unresolved now contributes **2** to the generic `incompleteItems.length` total (1 pricing + 1 TR) — two genuine distinct fixes, consistent with the per-row pattern; the per-category counts (banner/`_trCount`/`_pricingCount`) are independent and correct. Also a UX plus: TR rows are now itemized by part number in the modal's incomplete-items list rather than one vague "(Technical Review)" line.

**Verdict: count-fix correct — PASS.**
