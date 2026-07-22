# F025 — User "Attention" Dashboard — Scope + Feasibility

**Coach scoping lane (read-only trace of `src/app.jsx`) + Jon's product rulings · 2026-07-21 · all line refs `src/app.jsx`**

## The ask (Jon, 2026-07-21)
A quick, glanceable dashboard of the user's current projects showing **what needs to be addressed and what is timing out.** Two headline capabilities:
1. **Pending-RFQ visibility (#1 pain — Ryan & Noah):** after sending RFQs, nothing indicates a project is *waiting on supplier responses.*
2. **Aging/timeout alarm:** flag projects sitting in DRAFT / IN PROCESS / READY TO REVIEW / IN PRE-REVIEW / RFQ longer than a set period (~1 week).

## Jon's rulings (2026-07-21)
- **Placement:** TOP STRIP across the Projects board (matches Coach's rec — drop-in, reuses the KPI-box pattern; side-rail rejected = layout rework).
- **Scope:** MY projects default, with a team toggle (reuse existing `myProjectsOnly` `:44660`/`:44689` — `createdBy===uid || bcSalespersonCode` match).
- **Threshold:** one default (~7 days), **admin-configurable** in settings.

## Status mapping (Jon's 5 states → real code)
`computeProjectEffectiveStatus(project)` (`:16453`) is the single source of truth.

| Jon's label | Effective value | Column | Clean? |
|---|---|---|---|
| DRAFT | `"draft"` | draft | ✅ |
| IN PROCESS | `"in_progress"` | (BOM) In Process | ✅ |
| READY TO REVIEW | `"evc"` | "Ready To Review/**Send**" | ⚠ combined review-OR-send bucket — confirm intent |
| IN PRE-REVIEW | `"pre_review"` | In Pre-Review | ✅ = F003 pre-review |
| RFQ | `"rfqs"` (derived) | RFQs Send/Receive | ⚠ derived, broader than "awaiting response" — use §pending-RFQ predicate, NOT column membership |

## ★ Aging clock — feasibility (MIXED; key build-size driver)
**No status-entry timestamp exists** (`statusChangedAt`/`lastAccessedAt` → zero hits). Available stamps:
- `createdAt` — DRAFT proxy (draft is initial). ✅ acceptable
- `updatedAt` (bumped every save) — "last activity" → good for a **staleness** alarm ("no activity in N days"), NOT time-in-status
- `preReviewSubmittedAt` `:9355` — ✅ exact for IN PRE-REVIEW
- `rfqSentDate` (per BOM row) `:16484` — ✅ exact for RFQ (oldest row = clock start)
- `quoteSentAt` `:16469`, `postReviewSubmittedAt` `:9363` — exact (bonus states)

**Verdict:** exact for PRE-REVIEW + RFQ (+ sent, post-review); DRAFT proxy via `createdAt`; **IN PROCESS & READY have NO entry stamp** → proxy via `updatedAt` staleness now, OR add a `statusChangedAt` stamp in `saveProject` (`:9207`, add-only, Data-Retention-safe) for exact time-in-status everywhere (bumps build S/M→M/L). Coach note: for IN PROCESS/READY, "no activity in a week" (staleness) is arguably the *more useful* signal (catches abandoned projects).
**Precedent:** an RFQ 5-day "expired" alarm already exists inline (`RFQ_EXPIRED_MS`, `:36891`).

## ★ Pending-RFQ signal (the Ryan/Noah headline)
Two predicates exist and DIVERGE (pre-existing SSOT violation). Use the **panel-badge** definition (`:36894`), the correct one:
```
pending = bom.filter(r => r.rfqSentDate && (now-r.rfqSentDate)<RFQ_COOLDOWN_MS && !r.bcPoDate && (!r.unitPrice||r.unitPrice===0))
expired = pending.filter(r => (now-r.rfqSentDate) > RFQ_EXPIRED_MS)   // 5 days
awaitingVendors = new Set(pending.map(r => r.bcVendorName))
```
**Recommend factoring `:36889-36900` into a shared `_rfqAwaitingSummary(project)` → {awaitingVendorCount, expiredVendorCount, oldestSentDate}** so the panel badge AND the dashboard call one predicate (fixes the drift, per CLAUDE.md dual-consumer rule).
- "Awaiting response" = `awaitingVendorCount>0` (vendor count = `awaitingVendors.size`).
- "Response received / needs review" = an `rfqUploads/{token}` with `status==="submitted"` not yet `"imported"` (already surfaced as `pendingRfqUploads` `:36907`, listener `_listenRfqUploadsTeamScoped` `:2433`).

## Placement + reuse
Board view returns at `:44605`; header/KPI boxes `:44608-44648`, filter row `:44650-44664`, board `:44686+`. **Top strip inserts at `:44664`→`:44686`** (or extend the summary-box flex `:44641`).
**Reuse:** `box(label,value,color,bg,count,onClick)` KPI helper `:44628`; F023 `setFocusedCol` `:44734` (chips deep-link to a focused column); `Badge` `:16509` + `_statusColColors`/`_statusColBg` `:44716`; `computeProjectEffectiveStatus`; the RFQ block `:36889`; `myProjectsOnly` `:44689`; rfqUploads listener/count.

## Perf / risk
**Pure client-side derive — no new reads** for status/aging/RFQ-sent (projects already in memory; summary boxes iterate `projects` at `:44622`). Only external read = the rfqUploads "needs-review" count (listener already in scope). Multi-project / stale-closure risk LOW (render-time derive, no long-running async). Recompute from `projects`; do NOT cache per-project attention in a module map. The one optional write (`statusChangedAt`) is add-only in `saveProject`.

**Build size:** M (client derive + one factored predicate + top-strip UI). → M/L only if exact aging on IN PROCESS/READY (adds `statusChangedAt`).

## Open decisions for Jon (post-scope)
1. **Aging clock:** ship-now staleness proxy for IN PROCESS/READY vs add `statusChangedAt` for exact time-in-status everywhere.
2. **"READY TO REVIEW" target:** the `evc` "Ready To Review/Send" bucket, or a specific review state.
3. **RFQ return-leg chip:** include a "responses ready to review" chip (submitted-not-imported) beside "awaiting response"? (Recommended — completes the loop.)
4. Which projects count (active pipeline only vs include won/lost/imported).
