# #168 — C110 Runtime Evidence + Popup-Source Finding

**From:** Marc Masdev (runtime capture, live console, controlled tab)
**Date:** 2026-06-29

> ⚠️ **STATUS BANNER (read first — added at close-out).** #168 is **TABLED** (see TODO #168).
> Conclusions AFTER this doc was first drafted:
> - **Posting-group theory below is REFUTED.** All three suspect items have valid
>   `Gen_Prod_Posting_Group = INVENTORY` / `Inventory_Posting_Group = RAW MAT` in BC (Jon verified).
>   The "Inventory Posting Group is read-only" 400 is ARC PATCHing an already-set field — noise.
> - **The race was NOT the popup cause** (it never set `setSyncFailedAlert`) — but it was real and is
>   removed in v1.21.2 (a separate improvement, not the #168 fix).
> - The reported symptom (valid in-BC item flagged "couldn't sync") **did not reproduce**; the only
>   live failure was JOB BUYOFF genuinely not in BC (legitimate).
> - **The real primary-POST error was never captured** — it's discarded at app.jsx:3762 (now TODO #170).
>   Fix #170 FIRST before any future #168 dig. This doc's raw evidence (error strings, counts) is still
>   valid; its root-cause *theory* is superseded.

---

Coach — the v1.21.2 fix shipped and the happy path is clean, but live evidence shows our hypothesis was wrong and the fix likely does **not** address the reported popup. Full picture below so you can re-scope root cause. Two runtime captures + the code facts.

## Capture 1 — PRJ402129, v1.21.1 (PRE-FIX) — the failure reproduced

Auto-sync after extraction. Items: `CSD242010SS` (Enclosure, Concept Type 4X), `A24P20` (Enclosure, Backpanel 24x20), `ALD2QH211DNUG` (LED indicating light), + others.

```
37 × POST .../Company('Matrix%20Systems%20LLC')/Project_Planning_Lines_Excel  400 (Bad Request)
bcSyncPlanningLines: 0 created, 0 updated, 0 unchanged, 0 deleted, 37 FAILED
bcSyncPanelTaskDescriptions: task 20100/20110/20120/20199 updated
[BC] Fetched Purchase Prices for 36 of 37 items
```

Popup error string (the C110 pull):
> **"Type must not be Text in Project Planning Line Project No.='PRJ402129', Project Task No.='20110', Line No.='60000'."** (also 70000, 80000…)

**This disproves the race hypothesis.** It is NOT "record already exists" / duplicate-POST. It is a planning-line **Type-field rejection** (HTTP 400): lines landing on the `Type:"Text"` fallback, which BC rejects.

## Capture 2 — PRJ402130, v1.21.2 (POST-FIX) — happy path, DID NOT reproduce

Different (clean) project — items resolve fine. NOT a valid A/B vs Capture 1 (project + version both differ).

```
bcSyncPlanningLines: 41 created, 0 updated, 0 unchanged, 0 deleted   (0 FAILED)
bcSyncPanelTaskDescriptions: task 20100/20110/20120/20199 updated
OData PATCH failed: 400 "Control 'Inventory Posting Group' is read-only."   (×2, non-fatal here)
```

- ✅ No `Post-pricing BC sync:` line → **Path A confirmed gone**
- ✅ No popup, **exactly one** `bcSyncPlanningLines:` summary → consolidation works
- ✅ Task descriptions sync (V1 holds)
- ⚠️ The posting-group auto-fix PATCH was rejected as **read-only** even on this clean run.

**PRJ402129 has since been deleted** — the exact-items re-test on v1.21.2 is no longer possible from that project.

## The core problem with the fix (code-grounded)

The **"BC Sync Incomplete" popup is `setSyncFailedAlert`, called ONLY at `src/app.jsx:25214`, inside `syncPlanningLinesToBC`** — i.e. Path B (useEffect auto-sync) and Path C (manual button). **The deleted Path A (old 27459–27467) never called `setSyncFailedAlert`** — it only did `console.warn("Post-pricing BC sync: …")`.

➡️ So the post-extraction popup originates from the path we **kept**, not the path we **deleted**. On its face, deleting Path A does not stop this popup. The fix removed a redundant premature trigger (good, safe) but probably doesn't touch the reported symptom.

## Mechanism (what to trace)

In `bcSyncPanelPlanningLines`:
- BOM rows POST as `Line_Type:"Budget", Type:"Item", No:_bcNo(row)` — `src/app.jsx:3662`
- On failure, `_fallback` re-POSTs as `Type:"Text"` — `src/app.jsx:3669` → BC rejects → **"Type must not be Text"**
- `_bcNo(row) = row.bcNo || partNumber.slice(0,20)` (`src/app.jsx:4325`) — always non-empty, so `No` is populated; the Item POST is failing for another reason.
- Posting-group auto-fix `src/app.jsx:3679–3696` PATCHes `Gen_Prod_Posting_Group`/`Inventory_Posting_Group` when missing — but BC returns **"Inventory Posting Group is read-only" 400**, so the fix can't apply.

**Working theory (yours to prove/refute):** these items lack a valid `Gen_Prod_Posting_Group` in BC; ARC can't PATCH it (read-only); the `Type:"Item"` planning-line POST 400s; the `Type:"Text"` fallback is also rejected → 37 FAILED. This is **item/BC-config-specific**, independent of the auto/manual distinction and of the race.

## Open questions for your trace

1. Why does the `Type:"Item"` planning-line POST 400 for these items? (posting group? required field? item-not-found despite price fetch?) — the raw per-row `result.failed[].error` beyond the popup text would nail it.
2. Is there a real auto-vs-manual divergence at all, or is the original "manual syncs them all" situational (those items happened to have valid posting groups)?
3. If posting-group is the cause: is `Inventory_Posting_Group` genuinely read-only via OData, and is there a writable path (different endpoint/field) — or is this a BC-side data-setup requirement, not an ARC bug?

## Reproduction without PRJ402129

Inspect BC item master for `CSD242010SS` / `A24P20` / `ALD2QH211DNUG`:
`GET .../ItemCard?$filter=No eq '<pn>'&$select=No,Gen_Prod_Posting_Group,Inventory_Posting_Group`
If those posting-group fields are blank → root cause confirmed, no ARC re-extraction needed. (Jon can re-create the project from the source drawings if a live ARC repro is wanted.)

## v1.21.2 disposition

Keep deployed. It cleanly eliminated the duplicate-trigger race and the premature Path A POST; happy path is 41/0 with a single sync. It is a safe improvement. But **#168's reported symptom is unvalidated and likely unaddressed** — recommend reopening #168 with this corrected root cause pending your trace.
