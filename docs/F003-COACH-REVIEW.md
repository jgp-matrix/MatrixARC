# F003 — Role-Differentiated Tech Review — COACH FINAL REVIEW (pre-deploy)

**Author:** Sam Wize (Coach) · **Date:** 2026-07-06
**Reviewed:** diff `72c5994e` (core) + `dae43068` (Rev-A) vs plan `docs/F003-COACH-BUILD-PLAN.md`; verify `docs/F003-VERIFY-RESULTS.md`. Tip `d08ec55f`.

## VERDICT: ✅ APPROVE FOR DEPLOY

The build faithfully implements the plan and the locked ruled set (**1a/2b/3b/4a/5a/6b/keep/none**). The MEDIUM-risk sweep removal is clean in the FINAL code — no orphaned consumer. All five invariants hold. No blocking issues. Two disclosed non-blocking items + one pre-existing FYI, below.

## 7 edit sites — all match the plan
| Site | Plan | Built | ✓ |
|---|---|---|---|
| `_isReviewSignoffAuthority` helper (15883) | admin∥assignee, gated on `pending`, excludes reviewer-perm | exact | ✅ |
| Role-mutual-exclusivity branch (`_tr` cell) | engineer circle XOR user checkbox; C6 no label | exact (IIFE branch) | ✅ |
| Q2b `_trDisabled` | `+ ‖ preReviewStatus==="pending"` | exact | ✅ |
| C8 rowBg | module `_isUnresolvedTechReviewRow` before red, visual-only | exact (Rev-A brighter yellow `rgba(250,204,21,0.40)`) | ✅ |
| Q6b Approve gate | disable while unresolved + count tooltip | exact (`_trOpen` reduce, `_apDisabled`) | ✅ |
| Sweep removal | delete compute + swept-save, keep quote_ready | exact; `_trSweptPanels`/`_trChangedPanels`/`_trApproveOk` all gone; quote_ready kept | ✅ |
| Reject/Return | unchanged | unchanged | ✅ |
| data-tour | `bom-tr-user-checkbox` + `bom-tr-engineer-circle` | both present | ✅ |

## Ruled set — faithfully implemented
1a auto-stamp untouched (38991 not in diff) · 2b checkbox locks on `pending` · 3b circle = admin∥assignee only (reviewer-perm → checkbox) · 4a circle only while `pending` (also the C7 fix) · 5a circle reuses `_onTrResolve` (audit stamp intact) · 6b Approve gated / Reject free · keep send-gate reads `techReviewResolved` (untouched) · none no migration.

## Sweep-removal safety — re-confirmed against FINAL code
My plan §7 check holds in the shipped diff: (1) `preReviewStatus:"approved"` still written in exactly one place — now the gated Approve button; (2) no consumer assumes "approved ⇒ resolved" (the send-gate reads the live flag; the only other `approved` reader clears on re-edit); (3) per-row `_onTrResolve` persists via `onSaveImmediate`, so Firestore reflects every sign-off before Approve unlocks; (4) bundle confirms `_trSweptPanels` count **0**. The old #199 MED-2 partial-write hazard is structurally impossible now (approval writes no resolution). Comments re-documented accurately (Marc's disclosed stale-comment fix — reviewed, comment-only).

## Invariants — all held
1. **Data retention** ✅ same 5 TR fields; audit stamp preserved via reused `_onTrResolve`; no schema change. 2. **#199 send-gate** ✅ untouched, reads `techReviewResolved`. 3. **C8 visual-only** ✅ `_isBomRowFlaggedRed` + RFQ/logic predicates untouched. 4. **Pre-review flow** ✅ `preReviewStatus`/assignee/Send-for-Review intact; only resolution model changed (verified safe). 5. **No cross-user clobber** ✅ both branches write via the existing `latestPanelRef`+`onSaveImmediate` guarded handlers.

## Verify coverage (Marc, matrix-arc-test)
T1–T11 + all 4 Rev-A items PASS or CODE-VERIFIED. Live-passed where exercisable (Jon co-drove the React controlled-input clicks — known constraint); T3/T6b/T7/T8 code-verified (deterministic from source + bundle-confirmed). Jon signed off the yellow hue live ("good for now"). Solid, no open threads.

## Non-blocking items (do NOT gate deploy)
1. **Dead `_trIsReviewer` local** (disclosed) — the per-row `const _trIsReviewer=_isTechReviewer(project)` (~28985) is now unused (the branch uses `_isReviewSignoffAuthority`). Harmless (one wasted const/row, no behavior). Marc left it for minimal blast radius — **agreed**; suggest a trivial follow-up cleanup, not now.
2. **Stale-comment fix** (disclosed) — comment-only re-documentation of the removed sweep at `findIncompleteQuoteItems` + MED-3 send-gate. Reviewed, accurate.
3. **FYI — PRE-EXISTING, not an F003 regression:** resolving all TR rows (per-row) satisfies the #199 send-gate **independent of clicking formal Approve** — so a quote can become sendable once flags are resolved even if `preReviewStatus` is still `"pending"`. This is **pre-existing #199 P2 behavior** (the old per-row Resolve button already did this); F003 actually tightens it (circles only during `pending`+authority vs the old Resolve showing to any reviewer anytime). Flagged only so Jon is aware — if he ever wants sends to require formal Approve (not just resolved flags), that's separate scope, out of F003.

## Recommendation
Clear for **Jon's deploy checkpoint.** Version: **MINOR bump (v1.22.0)** is correct — F003 is a new workflow capability (role-differentiated review + approve-gate). Jon decides F003-alone vs bundling the banked F002 Rev 1 in the same hosting build.
