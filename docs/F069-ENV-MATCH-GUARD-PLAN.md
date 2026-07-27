# F069 — Hard guard: no project-scoped BC write against env ≠ Settings env — Coach scope

**Coach read-only · 2026-07-27 · master @ prod v1.24.38.** Design only. **Preventive invariant, NOT the Ryan incident fix** (in that incident all users already match the Settings env; root cause is B065, a wrong task number).

## The invariant (reframed by a structural fact)
Every BC URL is built from `_bcConfig.env` via getters `BC_ODATA_BASE`/`BC_API_BASE` (`_bcOdataBase` :354, getters :356-357). **No code ever builds a BC URL from `project.bcEnv`** → a request can never physically target a non-Settings env; the literal directive is already true at the transport layer. The real danger to prevent is the **inverse**: issuing a project's writes (project stamped `bcEnv=A`) while Settings=B → the write lands in B and 404s (noise) or **corrupts a same-numbered job in B**. That's what `_bcEnvMismatched(project)` (:370) detects.

- **(a) Project-scoped op** (carries `bcProjectNumber`/stamped `project.bcEnv`): **block when `project.bcEnv && project.bcEnv !== _bcConfig.env`.**
- **(b) Session/catalog op** (item/vendor/customer lookups, part#-keyed item/price writes): **out of scope** — no project env to compare; URL is Settings env by construction.
- **Legacy (no `bcEnv` stamp):** current code fails **open** (:373). Keep fail-open (see Q1 lazy-stamp).
- **Reads vs writes:** writes = corruption vector → **fail-closed**; project-scoped reads only 404/empty → **soft skip-and-return-empty** (matches existing poll guards), not a hard error.

## Coverage gap (the core problem)
All BC HTTP → `bcGatedFetch` (:446, 159 sites). `_bcEnvMismatched` is checked at only **8 caller sites** (25822, 25972, 27053, 27173, 36486, 36580, 36601, 40220) + one inline drift copy (`_syncServiceCardToBc` :36536). But `bcSyncPanelPlanningLines` alone is called from **~13 sites, most UNGUARDED** (16231, 27104, 28802, 35540, 40272, 40833, 41755, 42075, 42314). Per-caller guarding is the wrong altitude — one miss defeats the invariant.

## Project-scoped WRITE functions (the guarded set, ~18 — each carries projectNumber)
`bcCreatePanelTaskStructure` :3217 · `bcCreatePanelTaskBlock` :3330 · `bcAddEcoTask` :3417 · `bcCreateEcoTaskPlanningSkeleton` :3522 · `bcSyncServiceCardTask` :3616 · `bcDeleteEcoTask` :3737 · `bcSyncPanelTaskDescriptions` :3772 · **`bcSyncPanelPlanningLines` :3814 (highest-risk, ~13 callers)** · `bcSyncEcoPanelPlanningLines` :4091 · `bcCreateProject` :4309 · `bcUpdateProject` :4604 · `bcDeleteProject` :4590 · `bcPatchProgressBillingLine` :6259 · `bcPatchLaborPlanningLines` :6307 · `bcPatchPanelEndDate` :6368 · `bcPatchJobOData` :6384 · `bcAttachPdfToJob`/`bcAttachPdfQueued` :3116/3151 · `bcCopyProjectFromTemplate` :3173.
OUT of scope (catalog/part#-keyed): `bcCreateItem` :5245, `bcPatchItemOData` :5365, `bcPushPurchasePrice` :5550, `bcUpsertItemVendorLeadTime` :4723, `bcCreatePurchaseQuote` :6803, `bcUpdateItemCost` :9437, assembly-BOM :9266, `bcCreateCustomer/Contact/Vendor` :4441-4557.

## Design A (RECOMMENDED) — registry + one factored guard at each write function
Rejected: Design B (thread `expectedEnv` through ~40 sites — worse coverage); Design C (module `_bcActiveProjectEnv` + URL-class guard in `bcGatedFetch` — needs fragile URL classification AND breaks the Multi-Project Workflow invariant: batch/pre-print/bg loops span projects, so "active project" is wrong).
1. Module registry `_bcProjectEnvRegistry: Map<bcProjectNumber,bcEnv>`, populated wherever projects are set (`loadProjects`/`setProjects` + create/relink stamps :11260/40422/45708/51304); repopulate on env switch.
2. One factored guard by `_bcEnvMismatched` (:370): `_assertBcProjectEnv(projectNumber, opLabel)` → throws a tagged `BcEnvMismatchError` (`isBcEnvMismatch:true`) when `projEnv && projEnv !== _bcConfig.env`.
3. Call it at the **top of each ~18 write function** — each is ONE natural per-op chokepoint guarding all its callers → collapses ~40 fragile call-site guards to ~18 stable ones ("factor the rule, not the inputs").
Fail-closed-by-throw is clean: callers already `.catch`; and `bcEnqueue` (:6946) → `bcProcessQueue` (:6994) **already rejects env-mismatched items on replay**. Skip the pointless enqueue on `isBcEnvMismatch`. Keep the 8 existing caller guards as cheap defense-in-depth; fix SSOT drift — convert inline checks (:36536, :36131, :37726, :39981, :48603) to call `_bcEnvMismatched(project)`.

## Block-UX (contrast B064's "surface failures")
On a blocked write, dedup'd **once-per-user-gesture** toast (a Send Quote fires many panel syncs — fire once, not per-panel): "BC environment mismatch. This project is linked to «A», but you're connected to «B». Switch to «A» in Settings → BC, or re-link this project to «B». [Open BC Settings][Dismiss]". Reuse the "⚠ Old BC Environment" badge (:37159/48640) + Settings env editor (`saveBcConfig` :396, :44108). Reads skip silently.

## Risks
Intentional env switch → all old-env projects' writes block (correct, but surprising — badge communicates it). Legacy unstamped → fail-open (the one hole → Q1). Registry staleness → populate at every projects-set site.

## Build order
1. Registry (near :351; populate at load/set/create/relink). 2. `_assertBcProjectEnv` after :377. 3. Enforce at top of the ~18 write fns. 4. Skip `bcEnqueue` on `isBcEnvMismatch`. 5. Dedup'd once-per-gesture block-UX + `[Open BC Settings]`. 6. SSOT cleanup (inline checks → `_bcEnvMismatched`). H-item discipline; money-path (BC writes) → Coach review + live gate before prod.

## Repro
Project stamped `bcEnv="MATR_Prod"` + Settings `MATR_SndBx_01152026`: trigger a project write (Save labor → `bcPatchProgressBillingLine`; or Send Quote → `bcSyncPanelPlanningLines`) → hard-blocked, ONE clear toast, no outbound HTTP for that job; badge shows; a catalog read still works (reads not over-blocked); switch Settings back → write succeeds; confirm mismatched op not enqueued.

## Open questions for Jon
1. Legacy unstamped: keep fail-open, or **lazy-stamp `bcEnv=_bcConfig.env` on first confirmed 2xx sync** (never blind-stamp) so they become guardable? (Rec: lazy-stamp-on-success.)
2. Reads: soft-skip on mismatch (rec) vs hard-block too?
3. Block granularity: dedup'd once-per-gesture toast for bulk actions (rec)?
