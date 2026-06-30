# Session State — 2026-06-29 MDT (RFQ/reconciliation runtime session close-out)

## Version
**v1.21.3** (deployed 2026-06-29, PRODUCTION). Patch bump over v1.21.2.
Shipped: **#165 admin-only cross-strip detector** (Coach C117) — render-only, zero logic change.

## Deploy State
- **Master tip:** `2fc2022d` ("Session findings-log…"). Code/deploy commit: **`65d898e8`** ("Release v1.21.3").
- **`master == origin/master`** (in sync). **Tag `v1.21.3`** on origin.
- Production hosting: **https://matrix-arc.web.app** serving v1.21.3.
- **ROLLBACK POINT:** `master → 0f8a61fb`, redeploy **v1.20.142** (#160-era). Lineage: v1.21.3 = #165 detector;
  v1.21.2 = #168 race-removal; v1.21.1 = #158; v1.21.0 = #163.

## ⭐ NEXT SESSION — FIRST TASK: #175 RFQ lead-time visibility fix
Root cause of today's RFQ "over-selection" is really a VISIBILITY gap: a row missing a FIRM lead time
does NOT turn red, so the BOM reads "all good," then the RFQ pulls ~47/64 rows and surprises Jon.
**FIX DIRECTION:** drive BOM row warning-color off the SAME `isFirmLT` predicate the RFQ uses
(`leadTimeDays!=null && leadTimeSource && leadTimeSource!=="ai"`) so "not red" ⇒ "won't be RFQ'd for
lead time." **OPEN SUB-DECISION for Jon at start:** full-red vs a DISTINCT lead-time marker (so
missing-price vs missing-lead-time are tellable apart). Freddy's lean: same-predicate, distinct marker.
**FIRST ACTION:** Coach reads what currently drives BOM row color + where to hook lead-time state in,
then scope. Full detail + runtime evidence in TODO #175.

## What shipped this session (v1.21.3 / 65d898e8)
#165 admin-only cross-strip detector in ReconciliationModal. Predicate
`matchResult.changed.filter(m=>m.reason==="pn_changed" && m.prior.isCrossed)`, gated `isAdmin()`,
inline non-blocking banner naming the at-risk crossed-to PN(s). Rode alone, scope-clean, force-render
verified via harness, named-PN confirmed = crossed-to value. It is #165 TOOLING (not a separate finding)
— arms the manual Accept-on-crossed test for #165(B).

## Reconciliation cluster — resolved/verified this session (runtime, PRJ402096)
- **#164 → RESOLVED / NOT-REPRODUCIBLE on master.** Crossed Deleted-bucket row intact at modal mount
  across frozenBom / currentBom prop / matchResult.deleted + Coach's proven raw `keptDeleted.push(r)`.
  RESUME TRIGGER: only if a CLEANLY-PERSISTED cross (present in at-rest BOM before the drop) reverts
  after a Deleted→Keep COMMIT. Cite `docs/164-165-RECONCILIATION-RUNTIME-REPORT.md`.
- **#160 / C105 reject path → VERIFIED on real production crossed data.** Both Rejected crossed ducts
  committed with prior qty "12" + cross/BC/pricing intact via `{...m.prior}`.
- **#165 → STAYS OPEN, re-scoped (likely DOWNGRADE HIGH→MED).** `carryChangedPnChanged` fires ONLY on
  `pn_changed`; qty-Accept is cross-safe by code. Remaining risk = a `pn_changed` CROSSED row Accepted.
  Detector arms the manual test; NOT yet seen firing on a genuine organic case. Parts: (A) verb relabel
  still warranted; (B) Accept-on-crossed-pn_changed safety — manual repro pending a real candidate.

## RFQ over-selection — root cause runtime-proven, predicate change PARKED
`_eligibilityReason` (app.jsx:6314) lead-time check (6337–6338) is an INDEPENDENT include-trigger (no
cooldown gate, no sole-gap guard). PRJ402096: 36 missingLeadTime pulls, **34 = `leadTimeSource==="ai"`**
on firm+current+in-cooldown BC-priced rows (clincher 9342550; control 3044076 firm bc_vendor excluded).
These are AI LEAD-TIME estimates, NOT AI prices (prices are real BC). **The RFQ-breadth policy question
(should a firm-priced in-cooldown row be RFQ'd just to confirm an AI lead time?) is PARKED BEHIND the
#175 visibility fix — the red-row fix may dissolve it. Do NOT scope an RFQ predicate change until Jon
confirms the visibility fix doesn't fully satisfy.**

## NEW residual findings logged (LOW / observe)
- **#172** — flaky cross-apply (revert-on-apply, 2-of-3; selection modal re-fires). Leading suspect for
  the ORIGINAL #164 symptom. LEAD: no JS error, entangled with cross-apply BC sync. Trace later.
- **#173** — drop APPENDS pages (25→50) instead of superseding; manual re-region hazard. Needs a Brief.
- **#174** — native vector PDFs misclassified "scanned" (PRJ402096 FLS). Benign here; gates H5/region/
  block downstream. NOT linked to RFQ (different path). LOW.

## Open work queue (after tomorrow's #175)
- **#159** — Copy-to-New-Quote customer selection (scope: `docs/159-COPY-CUSTOMER-SCOPE.md`).
- **#165(A/B)** — verb relabel + Accept-on-crossed-pn_changed safety (detector now in place).
- **#170 / #171** — BC sync residuals (LOW). **#161/#162, #166** (LOW). **#169** parked at Brief-stage.
- **#163 production cutover — STILL GATED:** needs a prod BC env. Full detail in TODO #163.

## Pending / handoff notes
- **Coach C118** — detector-diff verification on v1.21.3 (`git show 65d898e8 -- src/app.jsx`) QUEUED,
  NOT done this session. Open for Coach next session.
- **Coach-owned uncommitted files** (left for Coach): `CLAUDE.md`, `COACH.md` (modified), `COACH-ARCHIVE.md`
  (new — the COACH.md bloat-trim, ~737 lines). Marc did NOT touch these.
- Marc committed `2fc2022d`: TODO findings-log + `docs/164-165-RECONCILIATION-RUNTIME-REPORT.md` +
  `docs/COACH-MD-BLOAT-FREDDY-REVIEW.md`.
- v1.21.3 deployed; master == origin/master.
