# B016 — Build-Ready Plan (silent mutation reverts under on-open BC churn)

> **Author:** Freddy (synthesizing away-mode scoping lane) · **Date:** 2026-07-11 · **Mode:** read-only scoping vs CURRENT `src/app.jsx` (prod v1.23.10 `c20d5321`; B021 + B013-1 + B013-2/3 + F019 all merged).
> **Status:** SCOPING COMPLETE — awaiting Jon's review of the approach + 3 decisions (§ end) BEFORE any build. Effort ~3 days, sequenced B016-1 → B016-2 → B016-3. B016-2 = minor bump, PR + Jon sign-off (Save-path protocol).

## 0. Corrected line refs (design doc was stale by 100–400 lines; code is authority)
`bcGatedFetch` **:446** (B021 — B016 does NOT touch it) · `saveProject` **:9079** · `safeSave` **:9318** · `saveProjectPanel` **:9418** (wholesale target-panel replace **:9513**) · `_dedupBomRowIds` call **:9512** (merge must precede) · project price-check + 30s **:37322-37385** (interval :37383) · `pollBcPricing` **:24400-24439** (5-min) · auto-sync planning lines **:25560-25586** · sell-price auto-sync **:25593-25607** · `bcPatchProgressBillingLine` **:5687** · `bcPrevSyncCount` def :24082 / seed :25565-25573 · **F019 standalone writeback :27964-27972** → `saveProjectPanel(...,!_hasOverrides)` · `saveImmediatePanel` :34566 · `_bcEnvMismatched` :370 · `_deletedRowIds` = **new marker** (0 uses today; `_deletedPanelIds` :9420 is the panel-level analog).

## B016-1 — Reduce on-open BC churn (lowest risk; do first; ~0.5d, patch)
- **(a) Project price-check 30s repeat (:37322-37385).** ⚠️ Framing correction: this is a **read-only** BC fetch feeding a diff modal — NOT a save-clobber source; and it fires **once per mount** (`priceCheckRan.current` :37341). The 30s interval only re-attempts while `quoteLocked`. **Fix:** drop the blind `setInterval(...,30000)` (:37383); re-run `tryCheck` via a dep-driven effect on `quoteLocked` true→false. Removes the standing 30s BC hit, keeps unlock re-enable.
- **(b) `pollBcPricing` (:24400).** Already re-reads `latestPanelRef` twice + writes targeted `newBom`. **Fix:** gate behind `document.visibilityState==='visible'` + skip when `_bcEnvMismatched(project)` (currently unguarded here).
- **(c) Coalesce auto-sync (:25560) + sell-price patch (:25593).** Both write BC line 10000 (`:3852` / `:5692`) → redundant on open. **Fix:** skip the standalone 2s sell-price patch when `bcAutoSyncTimer.current` is armed (the planning sync at :3852 already carries the fresh sell price).
- **(d) `bcPrevSyncCount` false-trip (:25565).** On open, `runPricingOnPanel` re-flips rows to `priceSource:'bc'` AFTER the initial seed → `bcCount` climbs → false full-sync. **Fix:** seed `bcPrevSyncCount.current` from the **persisted last-synced state** (add `panel.bcLastSyncedBcCount` alongside `bomSyncHash` at :25686, or derive from persisted hash). Belt: `syncPlanningLinesToBC` already bails on unchanged hash (:25613). ⚠️ **Instrument first** (breadcrumb at :25571) to confirm the N→M transition before building.

## B016-2 — Row-level merge-on-save (M2, the core; ~1.5–2d; minor bump, PR + sign-off)
**Where:** both `saveProjectPanel` (:9418, reuse `existingTarget` :9441 / `proj` :9431) and `saveProject` (:9079, per-panel loop) — reuse the EXISTING fresh server read (no extra Firestore read). Insert AFTER pages/notes/shapes merge + `_bumpBomVersionIfChanged` (:9510), **BEFORE `_dedupBomRowIds` (:9512)** and the panels.map replace (:9513). *(Ordering critical — dedup reassigns duplicate ids → would break id-matching if run first.)*

**Merge algorithm** (target panel; `incomingBom`=client, `serverBom`=fresh server):
- New row (id not on server) → keep incoming (user add).
- Existing row → base `{...incoming}` (content edits win — qty/PN/desc/etc., preserves today's behavior), then **Layer A — protected-group last-writer-by-timestamp (Jon's LOCKED policy):**
  - **Price group** (`unitPrice`+`priceSource`+`priceDate`): newer `priceDate` wins.
  - **Lead-time group** (`leadTimeDays/Source/UpdatedAt/Estimated`): newer `leadTimeUpdatedAt` wins.
  - **`bcPoDate`:** monotonic max (only moves forward).
- **Layer B — metadata gap-fill (data-retention belt):** for each field in `B016_METADATA_WHITELIST`, if `incoming[f]===undefined && server[f]!==undefined` → restore server value (undefined=stale→preserve; explicit null=intentional clear→honor).
- **Delete-vs-add:** a server row absent from incoming → **PRESERVE** (staleness) UNLESS its id is in `safeUpdated._deletedRowIds` (explicit delete → drop). Strip `_deletedRowIds` before write (never persisted).

`B016_METADATA_WHITELIST` (floor — finalize via independent grep at build): isCrossed, crossedFrom, isCorrection, correctionType, priceSource, bcVerify, bcFuzzySuggestions, bomVerification, extractionFeedbackLog, cannotSupply, techReviewFlag(+Source/Resolved/ResolvedBy/ResolvedAt), leadTimeSource, leadTimeEstimated, bcVendorNo, bcVendorName, supplierPartNumber, learnedPartNumber, suggestedPartNumber, aiBasis, aiSources, eco*(Tag/Number/Op/ModifiesBaseRowId/Original/CreatedAt).

**Baseline/dirty signal = the existing per-group timestamps** (`priceDate`, `leadTimeUpdatedAt`) — verified stamped `Date.now()` at every price/LT write + preserved on save; a generic field edit doesn't bump them. No new universal clock needed.

**★ REQUIRED companion fix (or the merge silently loses poll price updates):** `pollBcPricing` (:24426) updates `unitPrice` WITHOUT bumping `priceDate` → under last-writer-by-timestamp a stale user snapshot would out-rank the poll's fresh price. **Every protected-group writer must stamp its group timestamp** → add `priceDate:Date.now()` in pollBcPricing. Grep-audit all `unitPrice:`/`leadTimeDays:` writers (enumeration is a floor). *(Decision 1.)*

**`_deletedRowIds` must be stamped at every delete site** (floor — re-grep at build): `deleteBomRow` :26780 + ECO-revert :26766 · `removeBaseRowInEco` :26477/:26531 · `revertEcoRow` :17166 · any bulk/`bom:[]` reset. Each sets `panel._deletedRowIds=[...ids]` on the object handed to save. **A missed site = a delete that won't stick.**

**`productionEndDate`** (panel-level, :25305) has no per-field timestamp → resolve by panel `updatedAt` tiebreak, or add `productionEndDateUpdatedAt`. *(Decision 2.)*

## B016-3 — Resilient mutations (M3; ~0.5d)
Route user add/edit/delete through a `safeSave`-equivalent for panels (2 retries + `_saveFailBanner` :9317 + `logDebugEntry`) instead of the silent `try{onSaveImmediate}catch(e){}`. Sites: updateBomRow autosave :26639, saveBomRow :26721, addBomRow :26743, deleteBomRow :26767/:26781, saveLineQty :25707, savePanelName :25721, LT vendor writeback :26709, removeBaseRowInEco :26407. **Once B016-2 lands, no whole-panel background save can revert a user field** (merge re-applies the fresher side per group) → the per-field last-writer-wins makes a separate "edit-in-progress" flag unnecessary.

## ★ Critical interaction analysis
- **F019 (:27964) — NO regression.** Its completion save carries rows with fresh `priceDate:Date.now()` (set during pricing) → Layer A: incoming fresh > server → **F019's pricing wins the merge, writeback lands** (F019's whole purpose preserved). Provided the pricing path stamps `priceDate` on every priced row — verified it does. Add an F019 case to the test matrix.
- **B012 lease + cross-user guards — composes (additive).** The lease is preserved-not-enforced inside the save fns (carried via the `{...proj,...}` spread); enforcement lives at the UI `_eligibleEditor` layer + Firestore rules. B016-2 touches `bom` rows only, sits after the page-level storageUrl/notes merge + before dedup/replace → ownerTakeover/ownerLock/reviewNotes/storageUrl/pre-post-review guards all fire unchanged. With B012's one-editor lock LIVE, real user-vs-user conflict is largely prevented → B016-2's real job is **background-writer-vs-user within one client.**
- **B021/B013 — no conflict.** B016 doesn't touch `bcGatedFetch`; B016-1 *reduces* semaphore pressure (complementary); B013 health signal is orthogonal.
- **`nBom===0` total-wipe belt STAYS** (:9102 / :9451) — independent, keep it.

## Data-retention landmines
1. Merge never drops server metadata (Layer B gap-fill; base is `{...inc}` for content, restore absent whitelisted metadata). Never prune.
2. Delete-merge never wipes a `priceSource:"manual"|"bc"` or edited row (absence-without-marker preserves).
3. `schemaVersion` stays; no bump. B016-1 = patch; **B016-2 = minor** → PR + backward-compat load test.
4. Merge runs on the already-`dataUrl`-stripped panel; ordering preserved.
5. `_deletedRowIds` transient — stripped in merge, never persisted.

## Rollout (Save-path protocol)
1. **B016-1 first** → test-channel (Jon-driven — browser can't reach test host) → ship as patch after Jon confirm.
2. **B016-2 + B016-3 together** (B016-3's guarantee depends on B016-2) → **PR + Jon sign-off** + backward-compat load test → test-channel → prod (minor).
3. **2-session concurrent ADD+DELETE matrix** (Jon-driven, 2 browsers, 1 project): LT-edit vs price-edit on same row (both survive, different groups) · delete row Y w/ stale peer snapshot (stays deleted) · add row Z w/ stale peer (Z preserved) · **F019 pricing on project A while working project B (A's prices land)** · pollBcPricing price vs user qty edit (both survive).

## ★ DECISIONS FOR JON (review before build)
1. **`priceDate` stamping in `pollBcPricing` (:24426)** — add `priceDate:Date.now()` when it changes `unitPrice`? **Load-bearing** for last-writer-by-timestamp (without it the merge silently loses poll price updates). *(Rec: YES.)*
2. **`productionEndDate` resolution** — panel-`updatedAt` tiebreak (no new field) vs add `productionEndDateUpdatedAt` (:25305) for precision on a ship-date field. *(Rec: add the stamp — trivial, avoids a coarse tiebreak.)*
3. **`B016_METADATA_WHITELIST` completeness** — confirm the set (above) is complete vs the Data-Retention field list; it determines what survives a stale save. *(Rec: treat as a floor; final independent grep sweep at build time.)*
