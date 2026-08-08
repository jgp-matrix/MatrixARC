# SESSION-STATE.md — 2026-08-07 (EOD close-out)

> **Operating model:** subagent-lane (`/ARC-team-Startup`). One Freddy (CCD) session; Marc/Coach run as in-session subagent lanes; Freddy is sole git-writer + owns all handoff files (incl. STATUS.md/INBOX.md).
> **Prod = v1.25.7.** NOT frozen (freeze lifted early 2026-08-07; Jon directed 7 releases this session). master @ `4c15cda4`, in sync with origin, working tree clean.

## Current state
- **Prod version:** v1.25.7. Big ship day — **F089 (v1.25.0) → v1.25.7**, plus the B106 200-row vendor data repair.
- **OPEN items:** see `## ⭐ NEXT UP` + `TODO.md` (3,642 lines — over the 1,500 soft budget, archive-review pending) + `INBOX.md`.

## What shipped to prod today (2026-08-07)
| ver | items |
|---|---|
| v1.25.0 | **F089** "Refresh Pricing + Lead Times" (BC match+price+LT → Mouser/DigiKey wins + writes back to BC, F071-guarded; active-panel; honors vendor-on-row). Jon-verified live on PRJ402509 (decisive BC-record check). Minor bump. |
| — (data) | **B106** vendor name↔number repair: 148 REPOINT + 49 RESTAMP + 3 Hoists Direct = 200 rows across 24 projects, all reversible (`docs/b106-backfill-logs/`). Final classifier REPOINT/RESTAMP/AMBIGUOUS all 0. Reconcile decision (Jon): STOP — identity fixed is enough; F089 Refresh proven on PRJ402509 L1. |
| v1.25.1 | **B108** Accept-cross shows Vendor Part# not MTX# + **G029** removed "Add to BOM Only" button (Upload Supplier Quote modal) |
| v1.25.2→3 | **B110** RFQ tile pill "N of M RFQs RCVD" (replaced stuck "N SENT"), refined to hide when all received |
| v1.25.4 | **G030** hide redundant "READY TO SEND" status pill on tiles in the Ready-To-Send column |
| v1.25.5 | **B111** RFQ History "Received Quotes" counts only truly-submitted (status submitted/imported) + **#85** Excel/CSV → BOM direct import (BomFileImportModal + column-map modal + SheetJS; priceSource:"import"; Coach-reviewed, M1 owner-priority gate applied) |
| v1.25.6→7 | **B112** RFQ "N of M RFQs RCVD" pill made HONEST — driven by real supplier submissions (dashboard rfqUploads listener → per-project rfqStats{sent,received}), not priced-ness. PRJ402143 honestly shows "0 of 8". |

## ⭐ NEXT UP (ranked)

**#1 — F098 "Quote Line # + B065 Phase-2 durable ARC↔BC binding" (BUILD-READY DESIGN, forward-only).** The big one. Root fix for the missing stable line identifier (panel "LINE N" is a render-time timestamp sort; no stored line#; BC tasks/lines are positional + recomputed → the wrong-line/dropped-part class, Ryan 20510). Design: `docs/F098-quote-line-binding-plan.md` — `quoteLineNo` = frozen 1-based N stamped at creation, derives BC task `20000+N*100+10`; B065 `bcTaskNo` populated from confirmed 2xx; phased forward-only build (S2/S3/S4) each with a live-BC gate; found a money-path defect (resolver regex `:4342` blind to N≥10 posting tasks). **4 Jon decisions gate the build** (§9): (1) Option B (frozen key + render-time contiguous customer ordinal); (2) hard cap 99 lines + fix resolver regex; (3) quoteLineNo=frozen-N derives bcTaskNo; (4) service cards share the line sequence. Absorbs/subsumes F097. Builds on shipped B065 Phase-1 dormant contract.

**#2 — B109 "Vendor find/replace corrupted description text"** (NEW, needs triage/scope) — some BOM descriptions have a vendor token substituted into words ("16 Digikeyital Inputs", "Mouser Electronicsnting Rail") on PRJ402502. A global string-replace of a vendor alias hit the description field. Root-cause + prevalence unknown — scope it.

**#3 — F096 "Vendor de-dup guard (create-side)"** — pre-create dedup check in the BC "Create New Vendor" flow + dup-scan tool + verify vendor#↔name. Vendor family (B106/F075/F041). Pairs naturally with F098.

**#4 — F090 "BOMv version tracking"** — SCOPED + build-ready (`docs/F090-bomv-tracking-plan.md`): Dv-history subcollection reuse, bomvVersion counter, 6 bump triggers, restore+F089-refresh, absorbs G027. 7 Jon decisions. Effort L.

**#5 — G028 "Consolidate Sync BC + Push Lead Times"** — TABLED (Jon 2026-08-07); revisit later. Coach: NOT a clean merge (different gating/pre-flights/status surfaces) + F098 reworks the Sync-BC planning-line path — likely fold into / sequence after F098.

**Deferred polish / smaller:** #85 nits N2 (render imported price grey/italic like unverified) + N3 (tooltip friendly label "Imported from file"); F097 (post-B106 refresh prompt) — BUILT, on Test V.083, parked (F098 likely subsumes it); empty PRJ402143 orphan-stub cleanup (arc-51e349b70e…).

**Also open (older backlog):** B103 (BUYOFF config revert) · F091 (fix wrong BC Part# + propagate) · B102 remediation (61 BC-verified rows) · B101 §6e lifecycle audit stamps · B078-5 per-panel subcollection (deferred epic). Full list: `TODO.md` + `INBOX.md`.

## B106 remaining (deferred, low-urgency)
Remove F089's transitional supplier-LT guard (`src/app.jsx:32085`) after confirming zero name≠number supplier-LT rows remain (0 were in the repoint set — low urgency); the per-project F089-Refresh money-data reconcile happens naturally as each project is next worked (Jon: don't force a 24-project sweep).

## Docs produced this session
`docs/F089-live-verify-runbook.md` · `docs/B106-vendor-drift-scan-2026-08-07.md` · `docs/B106-authoritative-dryrun-2026-08-07.md` · `docs/B106-repoint-rowlist-2026-08-07.md` · `docs/B106-execution-plan-2026-08-07.md` · `docs/b106-backfill-logs/*` (reversible logs) · `docs/F098-quote-line-binding-plan.md` · `docs/85-excel-bom-import-plan.md` · tools: `b106-classify-vendor-drift.js`, `b106-repoint-backfill.js`, `b106-f097-set-flags.js`.

## Startup for next session
Boot `/ARC-team-Startup` (Freddy). First act on **F098 #1** — lock the 4 build decisions (§9 of `docs/F098-quote-line-binding-plan.md`) then start the phased forward-only build with live-BC gates. Or triage **B109** (description corruption). F097 stays parked on Test.
