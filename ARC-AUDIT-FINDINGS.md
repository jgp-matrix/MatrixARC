# ARC Deep Codebase Audit — Findings

**Date:** 2026-06-01/02 (overnight session)
**Author:** Sam Wize (Coach)
**Scope:** Comprehensive audit of `src/app.jsx`, `functions/index.js`, `functions/bomPrompt.js`, `firestore.rules`
**Rule:** NO CODE CHANGES — investigation only

---

## 1. EXECUTIVE SUMMARY

### Finding Counts by Severity

| Severity | Count |
|----------|-------|
| CRITICAL | 9 |
| HIGH | 23 |
| MEDIUM | 32 |
| LOW | 12 |
| **Total** | **76** |

### Top 10 Most Important Findings

1. **F-1a.3** — AI prompt instructs model to merge duplicate PNs, causing silent data loss (CRITICAL, app.jsx:11265, bomPrompt.js:215)
2. **F-3c.1** — 15+ BC API calls bypass `bcGatedFetch` semaphore, including the inner loop of planning-line sync (CRITICAL, app.jsx:3692)
3. **F-2b.1** — `saveProject` and `saveProjectPanel` enforce different guard sets; no shared mutex (CRITICAL, app.jsx:8462/8757)
4. **F-1f.1** — `saveProject` vs `saveProjectPanel` race: project-level save can clobber in-flight panel save (HIGH, app.jsx:8462/8761)
5. **F-1a.2** — Labor sync 800ms setTimeout writes stale BOM, losing user edits (HIGH, app.jsx:22736)
6. **F-1c.1** — `bcVendorNo`/`bcVendorName` diverge on archive restore (CRITICAL for data integrity, app.jsx:9567)
7. **F-1g.1** — "AI missed" message for dedup-caused sequence gaps is actively misleading (CRITICAL UX, app.jsx:21851)
8. **F-3c.4** — Partial BC sync success hidden behind green checkmark (CRITICAL, app.jsx:23600-23610)
9. **F-1d.1** — No bounds checking on AI-provided quantities or coordinates (HIGH, app.jsx:11715/10520)
10. **F-3a.1** — Restore lock not released on catastrophic failure (CRITICAL, app.jsx:9727-9988)

### Patterns Across Findings

- **Asymmetric guards**: Code paths that should enforce the same invariants don't. `saveProject` vs `saveProjectPanel`, client vs server prompt, different exclusion sets across BOM iterations.
- **Closure staleness**: Multiple setTimeout/debounce callbacks capture state at creation time rather than reading `latestPanelRef.current` at execution time.
- **Silent fallbacks that override user intent**: `?? defaultValue` patterns where the user explicitly chose "none" but gets a substitute (approval days, production days, markup, labor rate).
- **BC integration fragility**: Direct `fetch()` bypassing the semaphore, partial failures presented as success, no Firestore annotation of partial sync state.
- **AI output trusted without validation**: Quantities, coordinates, and field values from AI flow into internal structures with minimal bounds checking.

---

## 2. FINDINGS BY CATEGORY

---

### PART 1: PATTERN-BASED FINDINGS

---

#### 1a. STALE STATE WRITES

**F-1a.1** — Auto-print timeout captures stale quoteRev
- **Location:** app.jsx:35002
- **Pattern:** 400ms `setTimeout` callback reads `projectRef.current` (correct pattern), but builds `upd` object that could race with other state changes during the 400ms window.
- **Impact:** Stale `quoteRevAtPrint` if quote revision bumps during the timeout.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1a.2** — Labor sync 800ms timeout writes stale BOM
- **Location:** app.jsx:22736
- **Pattern:** `const updated={...panel,bom:[...laborRows,...nonLabor]}; onUpdate(updated); setTimeout(()=>onSaveImmediate(updated), 800);` — the `updated` closure is captured BEFORE the 800ms delay. User edits during that window are overwritten.
- **Impact:** User BOM edits silently lost if made within 800ms of labor sync.
- **Severity:** HIGH | **Effort:** SMALL — use `latestPanelRef.current` pattern like other timers.

**F-1a.3** — Modal save captures stale project closure
- **Location:** app.jsx:33743
- **Pattern:** `onSave: updated => { const proj={...project,...}; saveProject(uid, proj); }` — `project` is the closure value from when the modal opened. If the parent project changes while the modal is open, the save uses stale data.
- **Impact:** Panel data or project fields overwritten with old values.
- **Severity:** HIGH | **Effort:** MEDIUM — pass `projectRef.current` or a fresh-read callback.

**F-1a.4** — BC import fire-and-forget saves
- **Location:** app.jsx:44484, 44497
- **Pattern:** `newProjects.forEach(p => saveProject(uid, p).catch(...))` — no `await`, so project could be modified by user during the async save.
- **Impact:** User edits lost during bulk BC import.
- **Severity:** MEDIUM | **Effort:** MEDIUM

---

#### 1b. SILENT FALLBACKS

**F-1b.1** — customerApprovalDays defaults to 21 even when user intent is "none"
- **Location:** app.jsx:1309, 22305, 31112
- **Pattern:** `panel.customerApprovalDays ?? 21` then `Math.max(21, ...)` enforces 21-day minimum.
- **Impact:** Ship dates inflated by 21 days on projects without customer approvals.
- **Severity:** HIGH | **Effort:** SMALL — add tombstone flag like `bomRegionCleared`.

**F-1b.2** — productionDaysPostApproval defaults to 30
- **Location:** app.jsx:22301
- **Pattern:** `panel.productionDaysPostApproval ?? 30`
- **Impact:** Lead time gets 30 extra days when user intent was "no additional production days."
- **Severity:** HIGH | **Effort:** SMALL

**F-1b.3** — Markup defaults to 30% silently
- **Location:** app.jsx:1051, 19083, 32959
- **Pattern:** `pr.markup ?? 30` in three places.
- **Impact:** Quote prices inflated by 30% until user explicitly sets markup.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1b.4** — Labor rate defaults to $45/hr
- **Location:** app.jsx:632
- **Pattern:** `pr.laborRate ?? 45`
- **Impact:** Labor costs computed with assumed rate on misconfigured projects.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1b.5** — Pricing config cascading defaults
- **Location:** app.jsx:2010
- **Pattern:** `contingencyBOM ?? 1500`, `codaleStaleDays ?? 30`, `defaultStaleDays ?? 60`, etc.
- **Impact:** Company that explicitly cleared a config value gets hard-coded default instead.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-1b.6** — Title block auto-clear on page removal
- **Location:** app.jsx:22195-22207
- **Pattern:** When all pages are removed from a panel, `drawingNo`, `drawingDesc`, `drawingRev` are auto-cleared without user confirmation.
- **Impact:** Previously extracted title block data lost silently.
- **Severity:** MEDIUM | **Effort:** SMALL

---

#### 1c. INCONSISTENT FIELD SOURCE-OF-TRUTH

**F-1c.1** — bcVendorNo / bcVendorName diverge on archive restore
- **Location:** app.jsx:9567-9568
- **Pattern:** Archive restore updates `bcVendorNo` to remapped value but `bcVendorName` may retain the old name.
- **Impact:** RFQ grouping, vendor display, and reporting show old vendor name with new vendor number.
- **Severity:** CRITICAL | **Effort:** SMALL — update both fields together.

**F-1c.2** — priceSource / bcPoDate / priceDate triple divergence
- **Location:** app.jsx:6231, 10330, 24907, 25287
- **Pattern:** Auto-crossed parts get `priceSource:"bc", priceDate:null` (no `bcPoDate`). BC manual set at 24907 sets `priceSource:"bc"` without `bcPoDate`. Conditional writes at 25287 only write `bcPoDate` under certain conditions.
- **Impact:** UI shows wrong/missing price date. RFQ detection uses inconsistent heuristics (line 25276 vs 14883).
- **Severity:** HIGH | **Effort:** MEDIUM

**F-1c.3** — unitPrice / priceSource authority divergence
- **Location:** app.jsx:24716, 24884, 25580
- **Pattern:** Customer-supplied items set `unitPrice=0` without changing `priceSource`. Manual edits don't always update source. AI rows overwritten without source update.
- **Impact:** Pricing summary category counts wrong; manual rows miscategorized.
- **Severity:** HIGH | **Effort:** MEDIUM

**F-1c.4** — bcItemNumber / bcItemId / bcItemDescription on restore
- **Location:** app.jsx:9588-9589
- **Pattern:** Archive restore updates only `bcItemNumber`, leaving `bcItemId` and `bcItemDescription` stale.
- **Impact:** BC sync uses fallback (works but fragile); `bcItemDescription` misleads user about linked BC item.
- **Severity:** HIGH | **Effort:** SMALL

**F-1c.5** — isCrossed / crossedFrom / autoReplaced inconsistency
- **Location:** app.jsx:24734, 24737
- **Pattern:** User-initiated crosses don't set `autoReplaced`. Display logic at 27359 uses `autoReplaced` for badge display.
- **Impact:** Manually crossed rows don't show "[Crossed]" badge in UI.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1c.6** — rfqSentDate never cleared after pricing
- **Location:** app.jsx:25276 vs 14883
- **Pattern:** Two different heuristics for "active RFQ": one checks `!unitPrice`, other checks `!bcPoDate`. Neither clears `rfqSentDate` when the RFQ is resolved.
- **Impact:** Stale RFQ dates affect supplier portal and "Lead Times Only" mode.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1c.7** — qty / estimatedHours dual semantics on labor
- **Location:** app.jsx:1249, 6874, 19274
- **Pattern:** Hourly mode uses `qty`, lump-sum mode uses `estimatedHours`. If user switches modes, the other field becomes stale.
- **Impact:** Schedule and cost calculations may use different fields.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-1c.8** — leadTimeDays / leadTimeSource not reconciled
- **Location:** app.jsx:24462, 25287
- **Pattern:** Manual edits stamp `leadTimeSource:"manual"`, but portal apply doesn't update source tag.
- **Impact:** Source tag becomes advisory-only; tooltip misleading.
- **Severity:** LOW | **Effort:** SMALL

---

#### 1d. AI HALLUCINATION VECTORS

**F-1d.1** — No bounds checking on AI-provided quantities
- **Location:** app.jsx:13869 (coercion: `+it.qty||1`)
- **Pattern:** AI can return `qty: 999999` or `qty: NaN` — code just coerces with `||1`.
- **Impact:** Nonsensical quote totals if AI hallucinates a large quantity.
- **Severity:** HIGH | **Effort:** SMALL — add `Math.min(9999, Math.max(1, ...))`.

**F-1d.2** — Y/X coordinates not validated before merge logic
- **Location:** app.jsx:10520, 10637
- **Pattern:** `y_top`, `y_bottom`, `x_left` from AI used directly in dedup tolerance checks. No validation that values are in [0, 1].
- **Impact:** Invalid coordinates cause incorrect merge decisions.
- **Severity:** HIGH | **Effort:** SMALL — add bounds clamping after parse.

**F-1d.3** — Part numbers not sanitized before storage
- **Location:** app.jsx:13869
- **Pattern:** AI-returned `partNumber` stored as-is. Special characters (/, null bytes) not stripped.
- **Impact:** Potential path issues in downstream string operations.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1d.4** — JSON parse fallback regex fragile on nested JSON
- **Location:** app.jsx:11544
- **Pattern:** Strategy 4 regex `\{"itemNo"[^}]*\}` breaks on nested braces in notes/description fields.
- **Impact:** Silent field loss on truncated AI responses.
- **Severity:** HIGH | **Effort:** MEDIUM

**F-1d.5** — Low/medium confidence rows not enforced for review
- **Location:** app.jsx:11578-11598
- **Pattern:** Confidence is downgraded but no block prevents saving BOM with unreliable rows.
- **Impact:** Users proceed without reviewing flagged rows; wrong PNs flow downstream.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-1d.6** — additionalPartNumbers relationship field not validated
- **Location:** bomPrompt.js:131-149
- **Pattern:** No validation that `relationship` is one of the expected values.
- **Impact:** Downstream code fails silently on unexpected values.
- **Severity:** LOW | **Effort:** SMALL

**F-1d.7** — Placeholder rows saved without enforcing manual review
- **Location:** app.jsx:11596
- **Pattern:** Rows with `partNumber: "?"` are saved and appear in BOM. Pricing silently skips them.
- **Impact:** Invisible cost omissions on quotes.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-1d.8** — Prompt instructs AI to merge duplicate PNs (ALREADY KNOWN)
- **Location:** app.jsx:11265, bomPrompt.js:215
- **Pattern:** "DUPLICATE PART NUMBERS: combine into ONE item with total qty summed" — causes silent data loss for same-PN, different-description items.
- **Impact:** Items 17/18 on RSD0203-126 merged. Fix already designed; Jon approved prompt change.
- **Severity:** CRITICAL | **Effort:** SMALL

**F-1d.9** — Prompt duplicate-merge instruction redundant with code dedup
- **Location:** app.jsx:11265 vs 13872
- **Pattern:** Prompt tells AI to merge; code also merges. Creates ambiguity — if AI pre-merges, code can't undo it; if AI doesn't, code catches it. Recommendation: remove prompt instruction entirely, let code handle dedup.
- **Impact:** Design confusion; future AI model changes could break pipeline.
- **Severity:** MEDIUM | **Effort:** SMALL

---

#### 1e. MISSING EXCLUSIONS

**F-1e.1** — ECO material cost includes contingency/customer-supplied rows
- **Location:** app.jsx:15714-15716
- **Pattern:** `if(r.ecoTag===eco.ecoId && !r.isLaborRow)` — only excludes labor.
- **Impact:** ECO material delta incorrect; quote preview shows inflated ECO cost.
- **Severity:** HIGH | **Effort:** SMALL

**F-1e.2** — isPanelBudgetary excludes only labor/crossed
- **Location:** app.jsx:758
- **Pattern:** `filter(r=>!r.isLaborRow && !r.isCrossed)` — doesn't exclude contingency, customer-supplied, BUYOFF, crate.
- **Impact:** Panels incorrectly marked budgetary due to unpriced contingency/service items.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1e.3** — BOM report PDF uses partial exclusion
- **Location:** app.jsx:7451-7453
- **Pattern:** Regex for BUYOFF but doesn't use `_isBuyoffOrCrate` helper; misses crate pattern.
- **Impact:** Crate items appear on customer-facing BOM report.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1e.4** — BC price lookup sends excluded items
- **Location:** app.jsx:34376-34378
- **Pattern:** Only excludes `isLaborRow` from PN set sent to BC.
- **Impact:** Wasted BC API calls for contingency/crate part numbers.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1e.5** — Price difference audit excludes only labor
- **Location:** app.jsx:34376-34389
- **Pattern:** Compares all non-labor rows against BC prices, including BUYOFF/crate.
- **Impact:** False price-drift alerts for service items.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-1e.6** — BOM audit against drawings excludes only labor/contingency
- **Location:** app.jsx:12127
- **Pattern:** `filter(r=>!r.isLaborRow && !r.isContingency)` — doesn't exclude customer-supplied, BUYOFF, crate.
- **Impact:** False mismatch alerts for items not visible on drawings.
- **Severity:** LOW | **Effort:** SMALL

**F-1e.7** — Part frequency analysis excludes only labor
- **Location:** app.jsx:43963-43970
- **Pattern:** Statistics include contingency/BUYOFF items.
- **Impact:** Top-parts list polluted with non-real parts.
- **Severity:** LOW | **Effort:** SMALL

**F-1e.8** — Contingency detection by PN only, ignores flag
- **Location:** app.jsx:25761-25772
- **Pattern:** Uses `CONTINGENCY_PNS` set but not `isContingency` flag.
- **Impact:** Rows with `isContingency:true` but non-standard PN are missed.
- **Severity:** LOW | **Effort:** SMALL

**F-1e.9** — Quote tab material cost raw sum
- **Location:** app.jsx:19084
- **Pattern:** `bom.reduce((s,r)=>s+(r.unitPrice||0)*(r.qty||1), 0)` — no exclusions at all.
- **Impact:** Quote preview material cost includes contingency/BUYOFF/crate items.
- **Severity:** MEDIUM | **Effort:** SMALL

---

#### 1f. CONCURRENT EDIT RACES

**F-1f.1** — saveProject vs saveProjectPanel no shared mutex
- **Location:** app.jsx:8462 (saveProject), 8761 (saveProjectPanel lock)
- **Pattern:** Panel save lock only serializes `saveProjectPanel` calls. `saveProject` is unprotected.
- **Impact:** Concurrent project + panel saves can clobber each other.
- **Severity:** HIGH | **Effort:** MEDIUM — extend mutex to cover both paths.

**F-1f.2** — Configuration writes no serialization
- **Location:** app.jsx:2016, 2030, 2046, 2230, 2258, 2302
- **Pattern:** `savePricingConfig`, `saveLaborRates`, etc. all do direct `.set()` — no transaction, no lock.
- **Impact:** Concurrent admin config edits: last-write-wins, earlier changes lost.
- **Severity:** HIGH | **Effort:** MEDIUM — wrap in Firestore transactions.

**F-1f.3** — Anthropic ledger concurrent transaction conflicts
- **Location:** app.jsx:2505-2567
- **Pattern:** `runTransaction` but conflicts are caught and ignored. Parallel API calls can drop ledger updates.
- **Impact:** Spend tracking inaccurate.
- **Severity:** MEDIUM | **Effort:** SMALL — use `FieldValue.increment()`.

**F-1f.4** — External Firestore listener overwrites unsaved local edits
- **Location:** app.jsx:34534-34548
- **Pattern:** When another user's edit lands on Firestore, listener soft-applies to React state, clobbering any unsaved local changes.
- **Impact:** Silent loss of in-progress edits. Toast shows "External update applied" but damage is done.
- **Severity:** HIGH | **Effort:** LARGE — needs confirmation dialog or merge strategy.

**F-1f.5** — Auto-save races with extraction background task
- **Location:** app.jsx:13457-14231 (extraction), 22455+ (auto-save)
- **Pattern:** Both call `saveProjectPanel` concurrently. Panel mutex serializes them, but whichever runs second overwrites the first's changes.
- **Impact:** Lost BOM changes or lost validation results.
- **Severity:** HIGH | **Effort:** MEDIUM

---

#### 1g. UI WARNINGS THAT FAIL TO COMMUNICATE

**F-1g.1** — "AI missed" message for dedup-caused sequence gaps
- **Location:** app.jsx:21851-21853
- **Pattern:** Message says "N missing items — line N not found in extraction." Actual cause: items extracted but removed by dedup/filtering.
- **Impact:** Users investigate wrong cause; waste time on false leads or skip real issues.
- **Severity:** CRITICAL | **Effort:** MEDIUM — surface `mergeStats` dedup origin.

**F-1g.2** — ScanResultsBanner collapsed by default
- **Location:** app.jsx:21786
- **Pattern:** `useState(false)` — all warnings hidden behind "N concerns" summary.
- **Impact:** Users miss sequence gaps, audit failures, suspect parts.
- **Severity:** HIGH | **Effort:** SMALL — auto-expand when critical issues present.

**F-1g.3** — Missing API key silently disables all AI features
- **Location:** app.jsx:268
- **Pattern:** `console.warn("API key not found")` — no UI indication.
- **Impact:** Extract, pricing, and analysis buttons silently fail. User blames the app.
- **Severity:** HIGH | **Effort:** MEDIUM

**F-1g.4** — Exhausted API credits silently disables features
- **Location:** app.jsx:2446-2450
- **Pattern:** `console.error` + debug log only. No toast or toolbar indicator.
- **Impact:** Same as F-1g.3 but harder to diagnose (key exists, credits don't).
- **Severity:** HIGH | **Effort:** MEDIUM

**F-1g.5** — ECO partial-failure messages look like warnings, not blockers
- **Location:** app.jsx:15378, 15382
- **Pattern:** `kind="warning"` for "5 succeeded, 2 failed." User might dismiss without reading.
- **Impact:** User releases quote thinking ECO is complete in BC.
- **Severity:** HIGH | **Effort:** SMALL — clarify message, add failure details.

**F-1g.6** — BC sync status toast disappears in 2 seconds
- **Location:** app.jsx:23540, 23609
- **Pattern:** Green status for 2 seconds, then gone. No persistent "last synced" indicator.
- **Impact:** User retries sync when it already succeeded; or misses that it failed.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-1g.7** — aiBomRegion invisible when set
- **Location:** app.jsx:14420-14423
- **Pattern:** AI-detected BOM region saved silently. No UI shows crop coordinates or that a crop was applied.
- **Impact:** User doesn't know extraction used a subset of the page.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-1g.8** — BC field patch failures during sync are silent
- **Location:** app.jsx:3664, 3668
- **Pattern:** `try { await bcPatchItemOData(...) } catch(e) {}` — posting group auto-fix fails silently.
- **Impact:** BC item has mismatched posting groups; future POs may fail.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-1g.9** — ScanResultsBanner doesn't link concerns to BOM rows
- **Location:** app.jsx:21840, 21916-21920
- **Pattern:** "10 suspect part #s" with no click-to-navigate. User must scroll through 100-row BOM.
- **Impact:** Users ignore warnings rather than act on them.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-1g.10** — External update toast too brief (4 seconds)
- **Location:** app.jsx:34544, 36088
- **Pattern:** "Updated by teammate" disappears before user reads it. No detail on what changed.
- **Impact:** User confusion; no awareness of concurrent edits.
- **Severity:** LOW | **Effort:** MEDIUM

---

#### 1h. CROSS-CLIENT INCONSISTENCIES

**F-1h.1** — BOM prompts are in sync (VERIFIED)
- **Location:** app.jsx:11058-11409, bomPrompt.js:8-359
- **Status:** Character-for-character identical content. No finding here.

**F-1h.2** — saveProject vs saveProjectPanel guard divergence
- **Location:** app.jsx:8462-8684 vs 8757-8902
- **Pattern:** `saveProject` has high-water mark check, admin field preservation. `saveProjectPanel` has intentional-removal detection, BOM dedup. Neither has the other's guards.
- **Impact:** Panel save missing high-water mark → stale save can wipe panels. Project save missing dedup → duplicate row IDs. Project save missing intentional-removal check → accidental page wipe.
- **Severity:** CRITICAL | **Effort:** LARGE — factor guards into shared function.

**F-1h.3** — Server returns raw AI response; all parsing is client-side
- **Location:** functions/index.js:2460-2469 (returns raw), app.jsx:11500-11630 (parses)
- **Pattern:** Server does zero parsing, verification, or confidence downgrade. If client fallback removed, data quality drops.
- **Impact:** Architectural risk if server becomes sole extraction path.
- **Severity:** MEDIUM | **Effort:** N/A (intentional split, but underdocumented)

**F-1h.4** — BOM dedup in saveProjectPanel but not saveProject
- **Location:** app.jsx:8852 (saveProjectPanel), absent from saveProject
- **Pattern:** `_dedupBomRowIds` only called in panel save path.
- **Impact:** Full project saves can write duplicate row IDs to Firestore.
- **Severity:** MEDIUM | **Effort:** SMALL — add same call to saveProject.

---

### PART 2: ARCHITECTURAL FINDINGS

---

#### 2a. State Management

**F-2a.1** — No project-level save mutex
- **Location:** app.jsx:8737 (panel mutex only)
- **Pattern:** `_panelSaveLocks` serializes `saveProjectPanel` but `saveProject` runs without any lock.
- **Impact:** Concurrent saves race. See F-1f.1.
- **Severity:** HIGH | **Effort:** MEDIUM

**F-2a.2** — Lead-time queue not cleared on panel save
- **Location:** app.jsx:22465, 24493-24505
- **Pattern:** 30-second debounced BC writes not flushed when panel saves to Firestore. Firestore and BC can diverge for up to 30 seconds.
- **Impact:** Lead-time values appear to revert after batch saves.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-2a.3** — Stale _appCtx.companyId after company switch
- **Location:** app.jsx:17171-17173
- **Pattern:** `_appCtx.companyId` set once on login. If admin switches user's company, all subsequent saves go to old company.
- **Impact:** Edits saved to wrong company workspace.
- **Severity:** HIGH | **Effort:** MEDIUM

**F-2a.4** — BC token expiry not detected
- **Location:** app.jsx:381
- **Pattern:** `_bcToken` obtained via MSAL, no auto-refresh. Expires after ~1 hour.
- **Impact:** BC operations fail silently after extended session.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-2a.5** — Extraction interruption leaves panel half-extracted
- **Location:** app.jsx:13457-14231
- **Pattern:** Multi-phase extraction writes incrementally. Crash between phases loses in-memory progress.
- **Impact:** User must retry extraction from scratch.
- **Severity:** MEDIUM | **Effort:** LARGE (checkpoint system needed)

---

#### 2b. Save Path Uniformity

**F-2b.1** — Two save functions with divergent invariants
- **Location:** app.jsx:8462 (saveProject), 8757 (saveProjectPanel)
- **Pattern:** See F-1h.2. Guards are split across the two functions with no shared enforcement.
- **Impact:** Bugs depend on which save path was called — hard to reason about.
- **Severity:** CRITICAL | **Effort:** LARGE

**F-2b.2** — bomVersion not bumped on all BOM change paths
- **Location:** app.jsx:8360-8370
- **Pattern:** Supplier portal "Apply Prices" and other bulk operations may update BOM without calling the main save path, skipping `_bumpBomVersionIfChanged`.
- **Impact:** Drawing version pill doesn't reflect the change; quote rev may not bump.
- **Severity:** MEDIUM | **Effort:** MEDIUM

---

#### 2c. Schema Migration

**F-2c.1** — No findings specific to schema migration surfaced during this audit. The `schemaVersion` / `APP_SCHEMA_VERSION` system appears functional. Noted as a gap in audit coverage — would need access to production Firestore data to verify old-schema projects load correctly.

---

#### 2d. BC Sync Robustness

**F-2d.1** — 15+ unquoted fetch() calls bypass bcGatedFetch
- **Location:** app.jsx:3062, 3074, 3338, 3369, 3577, 3692-3696, 3747, 4480, 4484, 4508, 5121, 5477
- **Pattern:** Direct `fetch()` instead of `bcGatedFetch()`. Most critically: `patchLine()` at 3692-3696 is the inner loop of planning-line sync (called per modified BOM row).
- **Impact:** Cascading 429 storms during "Push All" on large BOMs.
- **Severity:** CRITICAL | **Effort:** MEDIUM — convert to bcGatedFetch.

**F-2d.2** — PDF attachment not atomic
- **Location:** app.jsx:2812-2835
- **Pattern:** Step 1 (POST metadata) succeeds, Step 2 (PATCH binary) fails → dangling metadata, old file deleted, new file never uploaded. `bcPdfAttached: true` set before upload starts (line 2608).
- **Impact:** User sees "Uploaded" but file missing in BC.
- **Severity:** CRITICAL | **Effort:** MEDIUM

**F-2d.3** — Firestore saved AFTER BC sync (crash risk)
- **Location:** app.jsx:23567-23608
- **Pattern:** BC sync completes → Firestore write follows. If crash between the two, BC is ahead of Firestore. Next load re-syncs stale BOM.
- **Impact:** Duplicate or stale planning lines in BC.
- **Severity:** CRITICAL | **Effort:** MEDIUM — write idempotency marker to Firestore first.

**F-2d.4** — Partial sync success hidden behind green checkmark
- **Location:** app.jsx:23600-23610
- **Pattern:** Line 23603 shows green ✓ if ANY lines succeeded, even if 20% failed. `bcSyncErrors` cleared.
- **Impact:** User doesn't know some items are orphaned in BC.
- **Severity:** CRITICAL | **Effort:** SMALL — preserve error state for partial failures.

**F-2d.5** — Queue items silently dropped after 5 attempts
- **Location:** app.jsx:6160
- **Pattern:** `console.warn()` only. No UI notification, no debug log entry.
- **Impact:** User's BC operations (PDF attach, PO create) silently fail permanently.
- **Severity:** HIGH | **Effort:** SMALL — log to debugLogs, show toast.

**F-2d.6** — Vendor link creation not atomic with item creation
- **Location:** app.jsx:4855-4905
- **Pattern:** Item created in BC, then vendor patch attempted 3x. If all fail, item exists without vendor.
- **Impact:** Firestore records vendor but BC item has none. Sync divergence.
- **Severity:** HIGH | **Effort:** MEDIUM

**F-2d.7** — Queue base64 can exhaust localStorage
- **Location:** app.jsx:2841-2853
- **Pattern:** 4MB PDF → 5.3MB base64 stored in localStorage queue. No size check.
- **Impact:** Silent localStorage overflow; other localStorage data corrupted.
- **Severity:** MEDIUM | **Effort:** SMALL

**F-2d.8** — Lead-time flush on tab-hide ignores errors
- **Location:** app.jsx:22471-22472
- **Pattern:** `catch(()=>{})` swallows failures.
- **Impact:** User navigates away thinking lead times synced; they didn't.
- **Severity:** MEDIUM | **Effort:** SMALL

---

### PART 3: RECENT CODE AREA FOCUS

---

#### 3a. Archive/Restore

**F-3a.1** — Restore lock not released on catastrophic failure
- **Location:** app.jsx:9727-9988
- **Pattern:** If restore crashes hard (e.g., Firestore timeout during step 7), the lock acquired in step 1 is never released.
- **Impact:** Project locked permanently; requires manual Firestore intervention.
- **Severity:** CRITICAL | **Effort:** MEDIUM — add try/finally around lock scope.

**F-3a.2** — Restore steps 9-10 not skipped when step 6 fails
- **Location:** app.jsx:9911-9937
- **Pattern:** If BOM restore (step 6) fails, later steps (labor, compliance) still attempt to run on incomplete data.
- **Impact:** Partially restored project with inconsistent state.
- **Severity:** MEDIUM | **Effort:** SMALL

---

#### 3b. Copy Project

**F-3b.1** — Silent image copy failures
- **Location:** app.jsx:10066-10073
- **Pattern:** Storage image copy failures are caught and logged but not surfaced.
- **Impact:** Copied project missing page images; user doesn't know.
- **Severity:** LOW | **Effort:** SMALL

---

#### 3c. BC Sync/Semaphore

See F-2d.1 through F-2d.8 above.

**F-3c.1** — bcGatedFetch doesn't release semaphore on network error
- **Location:** app.jsx:386-418
- **Pattern:** If `fetch()` throws (network error, not HTTP error), the semaphore slot may not be released.
- **Impact:** Semaphore gradually fills; after 6 network errors, all BC calls block permanently until page reload.
- **Severity:** CRITICAL | **Effort:** SMALL — add try/finally around fetch.

---

#### 3d. BOM Dedup

**F-3d.1** — Fuzzy dedup Y-guard description-override may merge product-family variants
- **Location:** app.jsx:10517-10528
- **Pattern:** When Y-positions differ but descriptions are identical, fuzzy merge is allowed. But same-family products (e.g., Allen-Bradley 800FP-F2/F3/F4) with similar descriptions at different Y positions could still be merged.
- **Impact:** Product-family variants collapsed into single row.
- **Severity:** MEDIUM | **Effort:** MEDIUM — add itemNo guard to fuzzy dedup description override.

---

#### 3e. ECO Flatten

**F-3e.1** — Orphaned ECO remove references not logged
- **Location:** app.jsx:888-890
- **Pattern:** If `ecoModifiesBaseRowId` points to a deleted base row, the ECO row is silently skipped.
- **Impact:** User doesn't know an ECO change was dropped during flatten.
- **Severity:** HIGH | **Effort:** SMALL — add warning log and surface in UI.

---

#### 3f. BOM Region Tombstone

**F-3f.1** — Tombstone cleared on save when AI detects new region
- **Location:** app.jsx:27453-27454
- **Pattern:** `if(hasBomRegion) pgPatch.bomRegionCleared=false` — unconditionally clears tombstone when any BOM region exists, including newly AI-detected ones.
- **Impact:** User cannot permanently suppress a noisy AI BOM region; tombstone resets on every AI detection.
- **Severity:** MEDIUM | **Effort:** MEDIUM — only clear tombstone for user-drawn regions.

---

### PART 4: UI FEEDBACK GAPS

---

**F-4.1** — Progress indicators for extraction don't show per-page detail
- **Location:** See TODO #75 (already filed)
- **Severity:** LOW (cosmetic)

**F-4.2** — Page type detection runs silently in background
- **Location:** app.jsx:15886, 22972
- **Pattern:** Pages classified asynchronously with no "Analyzing..." indicator.
- **Impact:** Feels "magical" but doesn't block work.
- **Severity:** LOW | **Effort:** MEDIUM

**F-4.3** — Console-only: extraction path logging
- **Location:** app.jsx:11443, 13646, 13704
- **Pattern:** Whether extraction used full-page vs crop, L3 retry recovery stats — all console.log only.
- **Impact:** Advanced users can't debug extraction quality from UI.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-4.4** — Console-only: BC auto-fix logging
- **Location:** app.jsx:3664, 5459
- **Pattern:** Posting group auto-corrections logged to console only.
- **Impact:** Users don't know items were automatically corrected.
- **Severity:** MEDIUM | **Effort:** MEDIUM

**F-4.5** — Console-only: BOM ID dedup
- **Location:** app.jsx:853, 860
- **Pattern:** `console.warn("BOM ID DEDUP:", fixed, "duplicate IDs resolved")`
- **Impact:** Diagnostic info invisible to users.
- **Severity:** LOW | **Effort:** SMALL

---

## 3. RECOMMENDED NEXT STEPS

### Tier 1: Fix Before Next Release (CRITICAL)

| Finding | Description | Effort |
|---------|-------------|--------|
| F-1d.8 | Remove/revise prompt duplicate-PN merge instruction | SMALL |
| F-2d.4 | Show partial sync failures instead of green checkmark | SMALL |
| F-3c.1 | Add try/finally to bcGatedFetch semaphore release | SMALL |
| F-3a.1 | Add try/finally to restore lock release | MEDIUM |
| F-1c.1 | Update bcVendorName alongside bcVendorNo on restore | SMALL |
| F-2d.1 | Convert inner-loop patchLine() to bcGatedFetch | MEDIUM |
| F-1g.1 | Reword sequence gaps message to explain dedup origin | MEDIUM |
| F-2b.1 | Factor saveProject/saveProjectPanel guards into shared function | LARGE |

### Tier 2: Fix in Next Sprint (HIGH)

| Finding | Description | Effort |
|---------|-------------|--------|
| F-1a.2 | Use latestPanelRef.current in labor sync timeout | SMALL |
| F-1a.3 | Pass fresh project ref to modal save callback | MEDIUM |
| F-1b.1/2 | Add tombstone flags for approval/production days | SMALL |
| F-1c.2/3 | Reconcile priceSource/priceDate triple on all write paths | MEDIUM |
| F-1d.1/2 | Add bounds validation on AI qty and coordinates | SMALL |
| F-1e.1 | Add exclusion set to ECO material cost calculation | SMALL |
| F-1f.1 | Extend save mutex to cover both save functions | MEDIUM |
| F-1f.2 | Wrap config writes in Firestore transactions | MEDIUM |
| F-1g.2 | Auto-expand ScanResultsBanner for critical issues | SMALL |
| F-1g.3/4 | Show toast when API key missing or credits exhausted | MEDIUM |
| F-2d.5 | Surface queue failures in UI, not just console.warn | SMALL |
| F-3e.1 | Log and surface orphaned ECO references | SMALL |

### Tier 3: Backlog (MEDIUM/LOW)

All remaining MEDIUM and LOW findings. Prioritize by user impact when scheduling.

### Findings Needing Design Before Fix

| Finding | Why |
|---------|-----|
| F-1f.4 | External edit conflict resolution needs UX design (merge vs overwrite vs discard) |
| F-2b.1 | Save path unification is a significant refactor; needs architectural plan |
| F-3f.1 | Tombstone-clearing logic needs to distinguish user-drawn vs AI-detected regions |
| F-2a.5 | Extraction checkpoint system needs design for crash recovery |

### Findings Needing More Investigation

| Finding | What's needed |
|---------|---------------|
| F-2c.1 | Access to production Firestore data to verify old-schema project compatibility |
| F-2a.3 | Verify whether company-switch flow is actually accessible in production UI |
| F-1e.9 | Verify whether quote tab material cost path actually hits this issue in practice |

---

## 4. ARCHITECTURAL OBSERVATIONS

### Broader Patterns

1. **The monolith carries coordination debt.** With ~46K lines in a single file, the only coordination mechanism between save paths is a per-project mutex that doesn't cover all callers. A save-path unification (F-2b.1) is the single highest-leverage refactor.

2. **Exclusion logic needs a canonical helper.** At least 9 different BOM iteration sites implement their own exclusion filters. A shared `_getPriceableBomRows(panel)` function called consistently everywhere would eliminate an entire class of bugs (F-1e.*).

3. **BC integration needs a state machine.** Today's sync is optimistic — green checkmark unless literally everything fails. A proper sync-state model (`pending → syncing → partial → synced → error`) with Firestore persistence would solve F-2d.3, F-2d.4, and F-2d.5 simultaneously.

4. **AI output validation belongs in a single post-parse function.** Bounds checking (qty, coordinates), sanitization (part numbers), and confidence enforcement should all live in one place after `_parseAndVerifyBomRaw`, not scattered across dedup and merge logic.

5. **The prompt-as-bug-source pattern is real.** The duplicate-PN merge instruction (F-1d.8) and the redundant dedup instruction (F-1d.9) show that prompt design needs the same review rigor as code. Recommendation: treat prompt text as reviewed code — changes require the same H-item approval as source code changes.

### Possible Prevention Tools

- **Lint rule**: Flag `?? <literal>` patterns where the left side is a user-settable field (catches F-1b.* class).
- **Pre-commit hook expansion**: Cover `.jsx` files (currently only `.js` per CLAUDE.md).
- **Save-path test**: A test that asserts both save functions enforce the same field preservation set.
- **BC semaphore audit**: A test that greps for `fetch(` calls in BC-related functions and asserts they all route through `bcGatedFetch`.

---

*End of audit. All findings are investigation-only — no code changes made.*
