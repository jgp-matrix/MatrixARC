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

### WS3 — Fix the BOM planning-line 400  ★ ROOT CAUSE = DATA GAP (diagnosed read-only 2026-07-28)
**The 400s are item-not-found — the new sandbox's Item master is incomplete.** Read-only probe of West Bay's BOM against `MATR_SndBx_UAT_070926` (via the standard items API, new-sandbox compId `269b2ed9-…`): **59 distinct items → 12 present, 47 MISSING.** Items exist there (e.g. `MTX-01003`), but the manufacturer-part-numbered items (`1489-M1C020`, `1492-H4`, `AGC-3/10-R`, the AB/Phoenix/Bussmann parts) are **not loaded**. Each planning line for a missing item → BC 400 "item cannot be found" → the whole BOM silently dropped. Pages themselves are fine (`Project_Planning_Lines_Excel` + `PurchasePrices` GET 200). **Also:** `ItemCard` + `Items` OData web services return **404 (not published)** in the new sandbox — ARC's item lookups depend on them.
- **BC-side prereqs (Jon / BC admin — the real blockers):** (1) **complete the Item master duplication** — ALL items every project references must exist with **matching `No.`s** (47/59 missing on just ONE project ⇒ the "exact duplicate" is far from complete across all 95); (2) **publish the OData web services** ARC uses (`ItemCard`, `Items`, + match the old sandbox's full published set — verify `PurchasePrices`/`Vendor_Card_Excel`/`ItemVendorCatalog`/task pages too).
- **ARC-side (still build these so a future gap isn't silent/destructive):** `relinkToBC` must check the planning-line sync `result.failed` (like B067) and report per-line failures + a non-✓ outcome — never "✓ Re-linked" on partial failure; and **back-off / fail-fast** after N consecutive BC errors (respect 429 `Retry-After`) to avoid the "too many error requests" storm seen in the pilot.
- **Gate:** no pilot until the new sandbox's item master + web services are complete — otherwise the BOM 400s recur regardless of ARC tooling.

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
