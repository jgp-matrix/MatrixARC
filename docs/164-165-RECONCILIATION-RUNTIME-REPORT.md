# Freddy — #164 / #165 / C105 Reconciliation Runtime Report (PRJ402096, live v1.21.2)

**From:** Marc
**Date:** 2026-06-29
**Method:** Live capture in the linked controlled tab (matrix-arc.web.app, v1.21.2). React-fiber reads off the ReconciliationModal + PanelCard; console reads for BC sync. Read/observe only — no code changes, no design.
**Project:** PRJ402096 "Salares Norte Retort" (FLSmidth), LINE 1 / 1001244897. Real production revision: 25 new pages dropped (appended → 50 total), new 25 hand-regioned.

---

## Headline results

1. **#164 (cross survives into Keep) — DOES NOT REPRODUCE on current master.** At ReconciliationModal mount the crossed Deleted-bucket row carried `isCrossed`/`crossedFrom`/`bcNo`/`priceSource`/`unitPrice` fully intact, byte-identical across `frozenBom`, the `currentBom` prop, and the `matchResult.deleted` entry Keep operates on. Combined with Coach's proven raw `keptDeleted.push(r)` (no stripping on commit), the cross reaches the modal whole and Keep would preserve it.
2. **C105 reject path — VERIFIED on real crossed production data.** Both crossed Changed rows were Rejected; both committed with prior qty `"12"` and cross/BC/pricing fully intact via `{...m.prior}`.
3. **#165 Accept-on-crossed-row path — STILL UNTESTED.** Both crossed Changed rows were *Rejected*, not Accepted. The two Accepted Changed rows were non-crossed. So the `carryChangedPnChanged` strip risk was not exercised. Additionally, all 4 Changed rows were `reason:"qty"` (none `pn_changed`) — and `carryChangedPnChanged` only fires for `pn_changed`. **#165's actual risk (a `pn_changed` row that is crossed) remains unobserved.**
4. **BC auto-sync — correctly suppressed by the #168 guard (by design), NOT a failure.** No `bcSyncPlanningLines` fired for the commit; 35 incomplete AI-priced rows tripped the load-bearing unpriced guard. No `Post-pricing BC sync:` line anywhere — v1.21.2 Path A deletion holds.

---

## PHASE 1 — pre-resolution snapshot (load-bearing)

Pre-state clean: 0 Changed / 0 Added / 0 Deleted resolved (only the 45 Unchanged auto-accepted by the mount effect). Staged extraction = 58 items; provenance clean (neither `DUCT,1X2,GREY` nor `F1X2LG6` present in staged → synthetic crossed row legitimately reached Deleted).

Counts: **45 unchanged / 4 changed / 9 added / 7 deleted.**

The 4 Changed rows (all `reason: qty`):

| idx | partNumber | qty | crossed? | crossedFrom | priceSource | unitPrice |
|-----|------------|-----|----------|-------------|-------------|-----------|
| 0 | 9342550 | 8→4 | no | — | bc | 136.80 |
| 1 | **DUCT,2X3,GREY** | 12→4 | **YES** | 3240199 | bc | 0.75 |
| 2 | **DUCT,4X4,GREY** | 12→1 | **YES** | 3240200 | bc | 5.13 |
| 3 | 3044076 | 116→109 | no | — | bc | 1.01 |

**Crossed Changed population = rows 1 & 2.**

Baseline note: the F1X2LG6 → DUCT,1X2,GREY synthetic cross (added with a 3-try revert-on-apply — see Side Observations) persisted CLEANLY before staging (all 5 fields intact in `latestPanelRef.current.bom`), so the mount result is interpretable.

---

## PHASE 2 — resolution + commit

Jon's resolution (read off the live `resolutions` Map before commit; `unresolved:0`, `canCommit:true`):

- **Changed:** Accept idx0 (9342550), **Reject idx1 (DUCT,2X3,GREY)**, **Reject idx2 (DUCT,4X4,GREY)**, Accept idx3 (3044076).
- **Deleted (7):** Keep → B911735 (non-crossed); Delete → XB4BW34B5, ZBZ32, XT2HU3010EFF000XXX (crossed 1SDA067773R1), XT1HU3003MFF000XXX (crossed 1SDA074724R1), XB4BA3311, DUCT,1X2,GREY (synthetic, crossed F1X2LG6).
- **New (9):** all Accepted.

No stranded Deleted row (all 7 resolved individually: 1 kept / 6 deleted). Commit enabled correctly. Commit → `buildReconciledBom` → Firestore write succeeded.

---

## PHASE 3 — persisted BOM re-read (post-commit)

Committed BOM: **64 rows, 17 crossed.**

**#6 REJECT path (C105) — the verified headline:**

| partNumber | qty | isCrossed | crossedFrom | priceSource | unitPrice |
|------------|-----|-----------|-------------|-------------|-----------|
| DUCT,2X3,GREY | **"12"** (prior retained) | **true** | 3240199 | bc | 0.75 |
| DUCT,4X4,GREY | **"12"** (prior retained) | **true** | 3240200 | bc | 5.13 |

`{...m.prior}` carried both crossed rows forward EXACTLY — prior qty kept, cross + BC + pricing intact, no field drift. **C105 reject fix confirmed on real production crossed rows.**

**#5 ACCEPT path:** the two Accepted rows were non-crossed and updated correctly (9342550 → qty 4; 3044076 → qty 109), cross-status unchanged (false). **No crossed row was Accepted**, so the `carryChangedPnChanged` strip path was not exercised — #165 Accept-on-crossed remains open.

**#7 New (9):** all present in committed BOM — B98110019, 3SU1401-1BH60-1AA0, 3SU1000-0AB40-0AA0, 3SU1900-0AH10-0AA0, 3SU1400-1AA10-1BA0, 3SU1500-0AA10-0AA0, 9345710, 9342250, XT2HU3010JFF000XXX.

**#8 Unchanged spot-check:** crossed unchanged row 2907600 (crossedFrom 2CDS252001R0324) kept its cross + price ($48). "Edits kept" holds at scale.

**#9 Deletions:** all 6 Delete-marked rows GONE (synthetic DUCT,1X2,GREY/F1X2LG6, XB4BW34B5, ZBZ32, XB4BA3311, both crossed breakers 1SDA067773R1 + 1SDA074724R1). Kept row B911735 survived (qty 3, intact). Note: the one Kept Deleted row was non-crossed, so cross-preservation-on-Keep wasn't *commit*-tested here — but it was proven at the mount snapshot (cross present in the deleted bucket that Keep pushes raw).

**#10 BC auto-sync — correctly gated, by design:**
- **No `bcSyncPlanningLines` fired for the commit.** The only planning-line syncs in the buffer (9 total) are at 5:09–5:10, from the earlier cross-apply *before* the 5:15 re-extraction.
- Cause: the v1.21.2 #168 LOAD-BEARING guard. useEffect path (app.jsx:25117–25120) skips sync when any non-labor row is unpriced; `syncPlanningLinesToBC` (25164–25165) backstops with `setUnpricedAlert`. Post-commit there are **35 incomplete rows** → guard correctly suppressed the sync.
- The four `+BC` pills on the new rows are **NOT pending-sync markers** (Jon confirmed): they mark parts that are **not in the BC Item Browser and need to be added to BC**. Until added, those parts have no BC price (`priceSource ≠ "bc"`), so they count toward the unpriced set that the guard gates on. The sync is therefore waiting on a user action (add parts to BC + price the remaining rows), not on a debounce timer. This is correct, expected behavior — the guard is doing exactly its job on a real revision that introduced new, not-yet-in-BC parts.
- **No `Post-pricing BC sync:` line anywhere** — v1.21.2 Path A deletion confirmed holding on a real mixed changed/new/deleted commit.
- A transient BC auth blip (401 on `bcFetchPurchasePrices` / `bcLoadAllProjectsOData` at ~5:24) appeared and recovered (toolbar = "BC Connected"); incidental token-refresh, not related to the sync gate.

---

## Side observations — logged, NOT traced (per parking discipline)

1. **Revert-on-apply (cross add):** applying the F1X2LG6 cross reverted to the original PN twice; selection modal re-appeared; took on the 3rd attempt. No distinct JS error in the buffer — entangled with the BC sync that fires on cross-apply. Possible second surface of the "applied cross reverts" mechanism. Classify after this result, don't trace yet.
2. **Drop appends, not replaces:** dropping the revised set APPENDED 25 pages onto the existing 25 (50 total, mixed old+new), forcing manual hand-region of only the new pages while avoiding the old. Worth its own scoping look; separate surface from #164/#165.

---

## Suggested routing

- **#164:** close as RESOLVED / not-reproducible-on-master, citing this runtime artifact (cross present + intact at mount; raw Keep-push). Symptom predates C103's cross-aware reconciliation or was the flaky-add artifact (obs #1).
- **C105:** mark verified on real data (Phase 3 #6).
- **#165:** keep OPEN — narrow the description to the untested risk: a `pn_changed` Changed row that is crossed, routed through Accept (`carryChangedPnChanged`). Needs a dedicated repro (force a PN change on a crossed row, Accept it, re-read). Qty-change Accept is cross-safe by code and not the concern.
- New tickets to consider from obs #1 (revert-on-apply) and obs #2 (append-not-replace) after your classification.
