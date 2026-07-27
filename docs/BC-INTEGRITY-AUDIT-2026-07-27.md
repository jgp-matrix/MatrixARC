# ARC ↔ BC Planning-Line Integrity Audit — 2026-07-27

**Orchestrated by Freddy · 6 read-only Coach investigation lanes · master @ prod v1.24.38 · `src/app.jsx`.**
**Why:** ARC↔BC planning-line integrity is existential — any silent divergence = missed parts / wrong orders / delayed shipments. Motivated by the Ryan/PRJ402141 incident (`docs/RYAN-BC-DISCONNECT-DIAGNOSTIC-2026-07-27.md`).

## Executive summary — two root themes explain everything
1. **Positional bindings, no durable link.** ARC computes every BC `Job_Task_No` = `20000 + panelIndex*100 + 10` and every BOM `Line_No` = `60000 + rowIndex*10000`, recomputed on every op. **Nothing durable ties a panel→its BC task or a row→its BC line.** So any add/delete/reorder/duplicate (ARC side) or renumber (BC side) silently slides the mapping onto the wrong or a non-existent record. *The durable-binding pattern we need already exists in-codebase — service cards persist `bcProjectTaskNo` instead of recomputing (`:1321/1356/3618`).*
2. **Silent failure in 3 layers.** (L1) `bcGatedFetch` is 404-blind — only 401/429/ok touch health (`:534`). (L2) ~15 write functions swallow `!ok` into `console.warn` and return normally. (L3) callers are fire-and-forget **and stamp a "synced" marker regardless of outcome.** So divergences both HAPPEN (theme 1) and STAY HIDDEN (theme 2) — the Ryan divergence sat silent 5 weeks.

**Highest-severity single risk (money-path):** a BOM-row insert/delete/reorder shifts every downstream `Line_No` → next sync **PATCHes the wrong BC planning line** (a row's part#/qty/cost overwrites a *different* line) **and DELETEs the tail line as an "orphan"** → **wrong part ordered / real part silently dropped, no error.** Independent of the Ryan task-number bug; same positional root.

---

## Divergence classes (ranked findings, with anchors)

### Class 1 — CREATE gaps (ARC has it, BC never gets it)
- **C1 [HIGH, concrete bug] Relink off-by-one:** `relinkToBC :40420` calls `bcSyncPanelPlanningLines(bc.number, i, …)` with **0-based `i`** while task structure was built 1-based (`:3253`) and every other caller uses `i+1` → relinked projects write planning lines onto the wrong tasks + mint a phantom `20010` block. → **B067-adjacent / fold into B065.**
- **C2 Positional task drift** (= theme 1): reorder/insert/delete a panel re-points all downstream tasks; backfill creates a new positional block while the old task's lines are stranded.
- **C3 [confirms B066] Attach-on-scan NEVER wired:** no `bcAttachPdf*` call anywhere in `addFiles`/extraction. `_autoSyncBcDrawings :39305` only RE-uploads on rev and is gated on `bcPdfAttached` which **only the manual "Upload to BC" button sets** (`:26972`). So a freshly-scanned panel never auto-attaches — **exactly Jon's observation (manual works, auto never fires).**
- **C4 Fire-and-forget create:** background/quote/print planning-line syncs `.catch(console.warn)` — a create failure leaves an ARC row with no BC line, no signal.
- **C5 [RFQ-only interaction] Pricing gate blocks whole-panel sync:** `syncPlanningLinesToBC` requires every non-labor row priced (`bc`/`manual`) else `setUnpricedAlert;return` (`:27085`). Under RFQ-only mode rows sit unpriced → the panel's planning lines never push.
- **C6 Partial task-create success stamped "linked":** `bcProjectNumber` persisted (`:11257`) before task structure built; individual task POST failures `console.warn`+continue (`:3309`), count ignored by callers.

### Class 2 — DELETE / REDUCTION leaks (the Ryan mechanism)
- **D1 [root, B016] Stale-closure reduction race:** `addPanel :36475` computes `n` from a stale `project` closure → two rapid adds read the same length → **duplicate panel names** (the "two Panel 2/Panel 4") **AND a skipped task index** → task 20510 **never created** (a create-*skip*, the dominant mechanism, not a delete). Also trips the panel-count guard 19× and feeds the Firestore write-exhaustion.
- **D2 [core leak] Guard is Firestore-only:** `SAVE BLOCKED` guard (`:9753`) returns early WITHOUT throwing — but `persistProject` already called `onUpdate(clean)` (`:35292`), so **in-memory React state is reduced even when the save is "blocked."** And **no BC path is gated by the guard** — BC task/line writes fire from effects keyed on the (now-corrupted) positional index.
- **D3 [HIGH] Silent orphan-DELETE swallow:** both delete loops (`:4063`, `:4218`) `if(dr.ok||204){deleted++}` with **no else/retry/log** → a failed BC DELETE silently leaves an orphan line ARC no longer tracks.
- **D4 `deletePanel` never deletes the BC task** (`:36552`) → a legit user panel-delete always orphans the BC task/lines (leak by omission).
- **D5 ECO whole-task delete** (`bcDeleteEcoTask :3737`) is wrong-index-prone + non-blocking (proceeds with ARC delete even if BC delete throws).

### Class 3 — UPDATE / sync-hash gaps
- **U1 [CRITICAL, the 5-week masker → B067] Hash stamped ignoring failures:** on-open sync (`:40272`) + pre-print (`:42075`) call `bcSyncPanelPlanningLines` then **unconditionally write `bomSyncHash`** without checking `result.failed`. `bcSyncPanelPlanningLines` does NOT throw on per-line 404/400 (collects into `failed`). → a half/fully-failed push is stamped "synced," `hashMatch` true next open → **never retries.** This is precisely how Ryan's 404s were masked. (Manual path `:27133` DOES check — same fn, opposite honesty.)
- **U2 [HIGH] Skeleton-line failures invisible:** billing line 10000 + labor 30/40/50000 built without `_row` (`:3899`); failure-capture gates on `if(_row)` (`:4041/4050`) → their POST/PATCH failures never enter `failedRows`. A panel with no priceable rows reports "synced, 0 failed" on total failure — **BC missing its invoicing + labor-budget lines.**
- **U3 Hash too narrow:** `computePanelBomHash :9599` hashes only `{pn,q,up}` → **description-only and lineQty edits never trigger a sync**; labor/sell patch failures are `console.warn`-only.
- **U4 Cross/PN edits only reach BC on a *completed* sync** — a masked partial failure (U1) leaves the OLD part# on the BC line = wrong part ordered. `_bcNo` prefers `row.bcNo`; 20-char `No` truncation not reflected in the hash.
- **U5 existing-line GET 404→`[]`** (`:3891`) → ARC thinks BC empty → blind full-rewrite, amplifies churn.

### Class 4 — SILENT-FAILURE surface (3 layers; audit-wide)
- **S1** Gate 404-blind (`:534`) — L1, per B064.
- **S2** Patch fast-paths (`bcPatchProgressBillingLine :6259`, `bcPatchLaborPlanningLines :6307`, `bcPatchPanelEndDate :6368`) swallow `!ok`→warn, **log only on `status===404`** (400/403/5xx = zero evidence), and every caller is `.catch(console.warn)`/`.catch(()=>{})`. **This is what actually bit Ryan**, and the per-404 `logDebugEntry` is itself the write-exhaustion amplifier (1 Firestore write/404, no dedupe → the 522-entry storm).
- **S3** `bcPatchJobOData` throws honestly but ~10 header-field callers empty-catch (`:37172/37221/37262/37285/37381`) → wrong bill-to/contact on the BC job, silent.
- **S4** Offline-queue silent drops (`bcProcessQueue :7051`): permanent-4xx (incl. 404) `continue` + `console.warn` only, after-5-attempts drop, env-mismatch drop → the "we'll sync later" promise silently broken; badge decrements as if handled.
- **S5** Sync-marker writes themselves fire-and-forget under write-exhaustion (`:27089/40279`) → a real success whose hash-write drops re-syncs forever (churn), or a failure-clear that drops leaves `bomSyncPending` stuck.

### Class 5 — IDENTITY / mapping integrity (= theme 1, deepest)
- Positional task# at 5 sites (`:3833/3253/3332/6312/6370`); positional `Line_No` (`:3945`); **no durable panel or row binding** (the `panel.bcProjectTaskNo` field exists but is vestigial/unused for panels).
- **Wrong-target write** (the headline money-path risk above): row shift → PATCH overwrites a different BC line + DELETE drops the tail. `If-Match:"*"` wildcard = no guard it's the same part.
- Env dimension: a *correct* positional number still resolves against the Settings env → a project's writes can land on a same-numbered job in the WRONG env (F069). Legacy unstamped projects fail open.

### Class 6 — DETECTOR / reconciliation (→ new feature F070)
See "Detector design" below.

---

## Consolidated bug list (numbers stamped by Freddy)
| Item | What | Sev |
|---|---|---|
| **B065** (expand) | Durable panel↔BC-task + row↔BC-line binding; resolve-from-BC + fail-loud/self-heal on 404 (not recompute); **includes relink off-by-one `:40420`** + positional-`Line_No` wrong-line-overwrite. Pattern exists (service cards). | HIGH — root |
| **B067** (NEW) | Sync stamps `bomSyncHash` ignoring `result.failed` (`:40272`,`:42075`) → masks divergence permanently, never retries. The 5-week masker. | HIGH |
| **B064** (expand) | Surface silent BC failures — 3-layer: gate 404-signal + write-fn recording (all statuses, not 404-only) + **auto-sync must check `result.failed` before stamping** + skeleton-line `_row` tagging + DELETE else-branch + queue-drop surfacing. Amber "endpoint degraded" chip + admin alert (throttled). | HIGH |
| **B016/B012** (expand) | Write-race root: `addPanel` stale-closure (dup names + task skip) + guard-covers-Firestore-not-memory-not-BC + debug-write self-amplifier + coalescing write governor + kill fire-and-forget. | HIGH |
| **F070** (NEW) | Continuous ARC↔BC mismatch DETECTOR (reconciliation). See design. | Feature — Jon's centerpiece ask |
| **F069** | Hard env-match guard (registry + `_assertBcProjectEnv` at ~18 write fns). | Feature — defense-in-depth |
| **B066** | Wire attach-on-scan (extraction-time) BC PDF attach + stamp; today only manual works. | BUG |
| B068-adjacent | `deletePanel` never deletes BC task (`:36552`) — orphan by omission; ECO delete wrong-index. | MED (fold into B065/B064) |

## Prioritized fix roadmap
- **P0 — unblock + stop the bleed:** (a) Ryan: Push-to-BC backfills the missing task (immediate). (b) **B065** durable binding + fail-loud-on-404 — kills the whole positional-drift class + the wrong-line-overwrite money risk.
- **P1 — stop the silent masking (money-path):** **B067** (check `result.failed` before stamping hash) + **B064** skeleton/DELETE/all-status capture. These make failures un-hideable so a divergence can't sit 5 weeks.
- **P2 — surface + detect + de-amplify:** **B064** amber chip + admin alert · **F070** detector (send-time gate + on-open + manual verify) · **B016** write-exhaustion hardening (debug-write throttle, coalescing governor).
- **P3:** **F069** env guard · **B066** attach-on-scan · `deletePanel` BC-delete.
- **Prereq for an always-on sweep:** app-only BC credentials — TODAY BC auth is delegated user-MSAL (Cloud Functions receive `bcToken` as a client param, `functions/index.js:2172`); no server-side BC credential exists.

## Detector design (F070) — the "never silent again" centerpiece
- **~80% already exists in the write path:** `bcSyncPanelPlanningLines` already discovers the page, GETs BC's actual lines (`:3890`), builds ARC's desired set (`:3899`), and diffs field-by-field (`:4016`). **Factor the builder+diff into a pure read-only comparator** (`mode:'audit'` = count what *would* change without writing).
- **Match on STABLE keys, never position:** compare BC's *actual* task-number set to ARC's expected set (flag task-missing/orphan); match BOM lines by **part# (`No`) within a task**, not `Line_No`.
- **Compare:** task existence · per-task line count · per-line `No`/`Quantity`/`Unit_Cost`/(line-10000 `Unit_Price`)/`Description`. Rank: wrong part# > qty/line-count > money > description.
- **Cost:** ~2 gated GETs/project (one `?$filter=Job_No eq …` returns all ~121 lines), sub-second → send-time gate is essentially free.
- **When:** send-time gate (BUILD FIRST — never ship a quote whose BC doesn't match) · on-open (piggyback OPEN BC SYNC `:40225`, record `bcReconciledAt`) · manual "Verify BC sync" button · periodic sweep (needs app-only creds — else use "not verified in N days" staleness as the signal).
- **Surface:** a **second data-integrity axis** (chip `BC in sync ✓ / N mismatches ⚠`) distinct from the connection pill (green pill ≠ data-matched — exactly Ryan); drill-down cloned from `syncFailedAlert :29992`; admin alert on **persistent** (≥2 checks) mismatch.
- **Auto-heal:** report-first; one-click Reconcile; **split** — additive (task/line-missing) opt-in auto; destructive (orphan-delete, overwrite) always confirmed (PO-clobber risk). Never silent auto-write.
- **Double-duty:** when the detector reads BC's actual task numbers, **persist the resolved binding** onto the panel → self-heals B065.

## Open questions for Jon
1. Send-time gate: hard-block on structural mismatch (task-missing/line-count) + soft-warn on field diffs? (Coach lean.)
2. Auto-heal split (additive auto / destructive confirm) — confirm.
3. Always-on sweep: provision app-only BC creds (true sweep) vs client-side "reconcile-on-open + staleness flag" now? (Coach: staleness-flag now, app-creds later.)
4. Part# unique within a task? (else BOM-line matcher needs a tiebreak.)
5. Should the detector persist the resolved panel↔task binding (= do double duty as the B065 fix)?

**Lane source docs:** `docs/B064-SURFACE-BC-FAILURES-PLAN.md`, `docs/B016-B012-WRITE-EXHAUSTION-PLAN.md`, `docs/F069-ENV-MATCH-GUARD-PLAN.md`, `docs/RYAN-BC-DISCONNECT-DIAGNOSTIC-2026-07-27.md`. Create/delete/update/identity/detector lane findings consolidated here.
