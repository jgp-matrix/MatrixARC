# BC Sandbox Migration Tooling — build plan

**Author: Freddy · 2026-07-28 · prod v1.24.44.** Pre-GoLive migration: point ARC at a fresh BC sandbox **`MATR_SndBx_UAT_070926`** (display "Matrix Systems - SandBox 07/09/2026"), seeded with Items/Vendors/Customers as an exact duplicate (matching `No.`s). The Re-link pilot on **PRJ402143** (West Bay, WWTP, CA) **failed** and revealed Re-link is unusable for the migration as-built. This plan fixes the tooling. **Money-path + BC-write → HIGH stakes; Coach review + fresh single-project pilot required before any bulk run.**

## Incident summary (the pilot — 2026-07-28)
Flipped company env → new sandbox; re-linked PRJ402143. Three independent failures (all confirmed live):
1. **Renumbered the project.** `relinkToBC` created a *new* BC job, BC auto-assigned **PRJ402000** (fresh series in the new sandbox), and relink **wrote 402000 back onto the ARC project** (`bcProjectNumber`). At scale, BC's series (402000, 402001…) **collides with existing ARC project numbers** → data corruption. Dealbreaker.
2. **BOM did not transfer.** Every `Project_Planning_Lines_Excel` POST returned **400**; the job + task structure created, but **zero planning lines** landed. The error flood then tripped BC's **429 "Too many error requests"** throttle. Re-link swallows these (`.catch(console.warn)`) and still reports "✓ Re-linked" — a silent drop.
3. **Spawned a shadow doc.** The background BC-import sync (`src/app.jsx:52406`) imports any BC job lacking a matching ARC project; it raced the relink and created a second **empty** `arc-<bcId>` project doc numbered 402000.

**Cleanup done (2026-07-28):** reverted West Bay → PRJ402143 + old env + old job re-linked (4 panels intact, field-level update); deleted the empty shadow stub. Env flipped back to old (`MATR_SndBx_01152026`) — known-good. Remaining: Jon deletes the bogus BC job PRJ402000 in the new sandbox before retry.

## Root causes (code-grounded)
- **`bcCreateProject(displayName, customerNumber, customerProjectNumber)`** POSTs `/companies(id)/projects` with **`{displayName}` only** → BC's project **No. Series auto-assigns** the number; then PATCHes `Global_Dimension_1_Code: d.number` (the BC-assigned number). It never sends the ARC project number.
- **`relinkToBC` (`:41478`)** sets `updated.bcProjectNumber = bc.number` (`:41496`) → overwrites ARC's number with BC's; also `.catch`es the planning-line sync and reports ✓ regardless.
- **BC-import sync (`:52396-52419`)** imports unmatched BC jobs as `arc-<bcId>` stubs (`saveProject` with `_noBumpWrite`); matches on `bcProjectId` OR `bcProjectNumber`.

## Requirements for a correct migration
1. A project's BC job in the new sandbox must carry the **same number** as ARC (`PRJ402143` → BC `PRJ402143`).
2. ARC's `bcProjectNumber` must **never be overwritten** by the migration.
3. The **full BOM** (planning lines) must transfer; failures must **surface** (no silent drop) and **not hammer** BC into a 429 storm.
4. No **shadow/duplicate** project docs.
5. **Reversible** and **piloted one project at a time** before any bulk run.

---

## Workstreams

### WS1 — Push the ARC number on BC create  ★ KEYSTONE
Fixes #1 (renumber) AND #3-shadow (#4 below) in one move: if the BC job = `PRJ402143`, ARC's number is unchanged AND the import-sync matches it → no stub.
- **BC-side prereq (Jon / BC admin):** the new sandbox's **Project/Job No. Series must allow Manual Nos.** (so BC accepts a caller-supplied `No.`). Verify BC's v2.0 `projects` POST accepts a `number` field under manual-nos (else set the number via an OData PATCH on `Job_Card`/`ProjectCard` immediately after create, before task/line sync).
- **★ Manual-Nos is MIGRATION-ONLY (Jon 2026-07-28):** enable Manual Nos. on the series ONLY for the re-link migration; **revert the series to no-manual-entry at GoLive** so new projects resume BC auto-numbering. Therefore WS1's number-push is **Re-link-scoped** — the New-Project flow stays on the auto series, unchanged, permanently. (No migration-mode toggle needed in New Project; only Re-link passes `opts.projectNumber`.)
- **Code:** extend `bcCreateProject(displayName, customerNumber, customerProjectNumber, opts?)` with `opts.projectNumber`. When provided: POST `{number: projectNumber, displayName}` (or create-then-PATCH the No.), and set `Global_Dimension_1_Code = projectNumber` (not the auto `d.number`). Return the confirmed number and **verify it equals** the requested one (fail loud if BC still auto-assigned).
- **Callers:** `relinkToBC` passes `project.bcProjectNumber`. New-Project flow (`:11271` region) stays on the auto series for *new* post-GoLive projects unless Jon wants ARC to own numbering going forward (open Q1).

### WS2 — Re-link must not renumber ARC (defensive)
- In `relinkToBC` (`:41496`), do **not** blindly set `bcProjectNumber = bc.number`. Keep `project.bcProjectNumber`; only update `bcProjectId` + `bcEnv` + clear/re-resolve durable bindings. With WS1, `bc.number` should already equal it — but assert equality and **abort + surface** on mismatch rather than overwrite.

### WS3 — Fix the BOM planning-line 400  ★ ROOT CAUSE = #163 item reconciliation not run (corrected 2026-07-28)
**Not missing items — RENUMBERED.** The new sandbox implemented #163: every BC item `No.` → `MTX-#####`, full Part# moved into **`Vendor_Item_No`** (Jon confirmed). West Bay's rows still store the **old mfr Part#** in `bcNo` (e.g. `1489-M1C020`), which is now only in `Vendor_Item_No` — so a planning-line POST with `No.=1489-M1C020` gets BC 400 "item not found" (it's `MTX-#####` now). Read-only proof: items-API `number eq '1489-M1C020'` → 0; but the item exists as MTX with that PN in `Vendor_Item_No`. Two gaps:
1. ~~`ItemCard` unpublished~~ — ✅ **RESOLVED: `ItemCard` IS published + resolves** (the earlier 404 was the BC 429 error-throttle from the pilot storm). Verified live 2026-07-28: `ItemCard?$filter=Vendor_Item_No eq '1489-M1C020'` → `No: MTX-110591`; `1492-H4` → `MTX-110695`. So ARC resolves old Part# → new MTX# live via `Vendor_Item_No` (the #163 resolver `_resolveBcNoFromVendorItemNo` `:5163` path). **No BC publish / mapping sheet needed** — BC-side is done. (Service doc confirms 123 web services incl. ItemCard/ItemVendorCatalog/PurchasePrices/Vendor_Card_Excel + task pages.)
2. **The #163 ARC reconciliation was agreed (`dba63c42`) but never executed** against this sandbox — BOM rows still carry the old Part# in `bcNo`. **This is the one remaining gap.**
- **ARC-side build = the #163 reconciliation** (per `dba63c42`, Coach scopes / Marc executes, **dry-run first**): walk every project's BOM; for each row resolve `bcNo`(old Part#) → new MTX# via `ItemCard?$filter=Vendor_Item_No eq <bcNo>`; rewrite **`row.bcNo` → MTX#** (leave `partNumber`/display as the mfr Part#). Skip rows already MTX (12/59) + labor/no-No rows; **flag unresolvable** rows (no VIN match) for manual. Confirm the #163 open question — is `row.bcNo` the sole cache of a BC No.? update any other cache too. Plus: `relinkToBC` surface-failures (B067-style, no silent ✓) + 429 back-off.
- **Timing (lockstep, per #163 strict order):** reconciliation resolves against the NEW sandbox's ItemCard, so run it as part of the cutover window (reconcile `bcNo`→MTX → flip env → re-link). Between reconcile and flip, projects must not sync to the OLD sandbox (their MTX `bcNo` won't match old). Dry-run + verify counts before the live rewrite.
- **Gate:** pilot one project after reconciliation rewrites its `bcNo`→MTX (+ WS1 number-preserve) — expect right number + full BOM.

### WS4 — Tame the BC-import sync during migration (defensive)
- With WS1 the import-sync matches by number → largely moot. Residual: the **race** (import fires before relink's save persists) can create a transient stub. Guard: skip importing a BC job whose number/id was created/linked in the last N seconds, **or** a migration-mode flag that pauses the import-sync (`:52396`) while a relink is in flight. Also: relink should persist the project's new `bcProjectId`/`bcEnv` **before** the import-sync's next cycle.

---

## Migration runbook (once tooling ships)
1. **BC-side:** delete the bogus PRJ402000 job; confirm the new sandbox's project No. Series allows Manual Nos.; confirm Items/Vendors/Customers duplicated with **matching numbers**.
2. **ARC:** projects already stamped `bcEnv=MATR_SndBx_01152026` (done — 95/95). Flip company env → `MATR_SndBx_UAT_070926` (off-hours; company-wide).
3. **Pilot ONE project** (fixed Re-link): assert the BC job = the ARC number, BOM lines all land (0 failed), no renumber, no shadow. Freddy network-traces + diffs BC line count vs ARC BOM.
4. If clean → re-link the rest (consider a guarded bulk "re-link all greyed"). If not → rollback = flip env to old; per-project revert snippet on file.

## Gates
`validate_jsx` → Coach money-path review (WS1/WS2/WS3 surface-failures + WS4) → deploy Test → **live single-project pilot on the new sandbox with BC-write network trace** → Jon sign-off → bulk. No bulk run until a pilot is clean.

## Open decisions for Jon
1. ~~**New-project numbering post-GoLive**~~ — ✅ **RESOLVED (Jon 2026-07-28): manual-nos is migration-only.** Re-link pushes the ARC number while the series allows manual entry; at GoLive the series reverts to no-manual and New Project resumes BC auto-numbering. WS1 is **Re-link-scoped**; New-Project flow unchanged.
2. **BC number-set mechanism:** does the new sandbox's `projects` API accept `number` on POST (manual-nos), or must we create-then-PATCH the `No.`? (BC-admin verification — affects WS1 implementation.)
3. **Bulk vs per-project:** after a clean pilot, add a guarded "Re-link all greyed projects" bulk action, or re-link individually? (95 projects.)
4. **Drawings:** Re-link does not re-attach PDFs/drawings — separate step per project. In scope for the migration, or handled later?

---

# Build-ready scope (Coach, 2026-07-28) — verified line refs

## #163 reconciliation — NOT a single-field rewrite (keystone)
`_bcNo(row)` (`:5145`) = `row.bcNo || partNumber.slice(0,20)` — the ONLY value POSTed as planning-line `No:` (`:4404`/`:4619`) → sole **money-path** cache. But the BC item No. is cached in **6 places**; reconciliation must handle each:
- `row.bcNo` — **YES, mandatory** (planning-line POST).
- `row.bcItemNumber` (`:11526`) — YES (quote↔supplier-quote BC cross-match).
- `row.bcPartNumber` — YES (restore-remap join + RFQ crossings; cheap, same walk).
- `panel.bcItemNumber` — YES **if** any panels pushed as assembly items (stale → 404 pulse).
- `sqCrossings.*.bcItemNumber` (config learning-DB `:9959`) — flag; non-gating.
- `supplierCrossRef.records[].bcPartNumber` (config learning-DB) — flag; non-gating.
- `row.bcItemId` (BC GUID) — **NULL it** (env-specific; new env invalidates old GUIDs) — as `applyRemaps :11525` already does.
**Precedent:** `applyRemaps` (`:11485-11529`) already rewrites `partNumber/bcPartNumber/bcItemNumber/bcItemId/bcVerify` together — the reconciliation is a bulk, non-interactive `applyRemaps` keyed by an ItemCard-resolved old→MTX map.

## Execution vehicle — new CF `reconcileBcNos` (templates already exist)
- **`stampProjectsBcEnv`** (`functions/index.js:461`) = the project-walk + `dryRun` + batched-write + report skeleton (verbatim reusable).
- **`bulkMfrLookup`** (`:2390`) = the client-passes-`bcToken`+`bcODataBase` + server-side ItemCard resolution + `dryRun` default-true + `isTest` force-dry pattern (answers "does a CF have BC creds?" — client delegates its MSAL token).
- **Data-safety:** unlike `stampProjectsBcEnv`'s scalar `batch.update`, this rewrites nested `panels[].bom[]` → must **read-modify-write field-level per project doc** (preserve every other field, `schemaVersion`, learning DBs, `storageUrl`, admin fields) — Data-Retention #1/#4 server-side. Persist applied old→new pairs to `companies/{cid}/bcReconcileRuns/{ts}` (audit + reverse-run map).

## Dry-run-first protocol (`dryRun` default TRUE)
1. **Resolution (read-only):** dedupe unique `bcNo||partNumber` across all projects; `ItemCard?$filter=Vendor_Item_No eq '<v>'&$select=No,Vendor_Item_No&$top=1` (`_resolveBcNoFromVendorItemNo :5168`) → `oldToMtx`.
2. **Classify + report every row:** resolvable / already-MTX (`^MTX-`, skip) / labor-or-null (skip) / **unresolvable (flag, never guess)** + counts + full old→new pairs + unresolvable list w/ project/panel/row identity.
3. Jon verifies → re-invoke `dryRun:false`.
4. **Apply:** field-level rewrite on resolvable rows only (bcNo+bcItemNumber+bcPartNumber, null bcItemId+bcVerify); leave unresolvable + mark `_bcReconcileFlag`; post-write re-resolve → expect 0 resolvable-but-unwritten.
- **★ Truncation risk (surface to Jon):** old `bcNo` 20-char capped (`_bcNo` `:5145`); new `Vendor_Item_No` is full → a truncated bcNo won't exact-match → unresolvable. Resolver: exact match first, then **single-hit-only** `startswith(Vendor_Item_No,<bcNo>)` (accept iff exactly one hit; else flag ambiguous). If the unresolvable count is still meaningful → fall back to Jon's #163 3-column mapping sheet (old-BC-No primary join). **Run the resolution dry-run FIRST to size this.**

## WS1/WS2/WS3/WS4 (line-grounded)
- **WS1** `bcCreateProject :4804`: add `opts.projectNumber` → POST `{number,displayName}` (or create-then-PATCH the No. under manual-nos — open Q2); `Global_Dimension_1_Code=opts.projectNumber` (`:4830`); **verify returned No.===requested, else roll back (`:4852-4864`) + throw.** Callers: `relinkToBC` passes `project.bcProjectNumber`; New-Project (`:11741`/`:46760`) unchanged.
- **WS2** `relinkToBC :41496`: keep `project.bcProjectNumber`; **assert `bc.number===project.bcProjectNumber`, abort+surface on mismatch** (no overwrite). Still update bcProjectId/bcEnv + clear bindings.
- **WS3** `relinkToBC :41487-41494`: read each panel's `bcSyncPanelPlanningLines` `result.failed` (`:4551`) → non-✓ itemized outcome, never silent "✓" (`:41508`). **Fail-fast:** abort remaining line POSTs after **N=5 consecutive** non-2xx/non-429 errors (the pilot's throttle was BC's "too many error requests" from a 400 flood — 400≠429, so existing 429 backoff `:4449-4467` doesn't cover it).
- **WS4** import-sync `:52381-52419`: (1) `relinkToBC` persists `{bcProjectId,bcProjectNumber,bcEnv}` **before** the sync loop (`_noBumpWrite`) so the import's per-cycle read (`:52389`) sees the number; (2) `_relinkInFlight` flag short-circuits the import block during a relink/bulk. Do both.

## Blocking decisions
1. **[WS1] Q2 — BC number-set:** does the new sandbox's v2.0 `projects` POST accept `number` under manual-nos, or create-then-PATCH? (BC-admin verify; code handles both, so non-blocking to *start*.)
2. **[reconciliation] Truncation join:** live `Vendor_Item_No` resolver + single-hit `startswith`, or require the #163 3-column mapping sheet? **Decide from the dry-run's unresolvable count — run resolution dry-run FIRST.**
3. Secondary caches (panel.bcItemNumber + config DBs) in-run or deferred. 4. Bulk vs per-project (95). 5. Drawings re-attach.

## Gates
validate_jsx → Coach money-path review (`reconcileBcNos`+WS1-4) → Test → **dry-run on new sandbox (report; Jon verifies counts)** → live reconcile → **1-project pilot relink w/ network trace** → Jon → guarded bulk. No bulk until one pilot clean end-to-end.
