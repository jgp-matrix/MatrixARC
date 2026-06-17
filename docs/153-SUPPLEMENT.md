# #153 Supplement — Drawing-Revision Re-Extract + BOM Reconciliation

**Author:** Sam Wize (Coach)  
**Date:** 2026-06-17  
**Status:** Supplement — codebase verification of Brief #153 assumptions  
**Source:** Brief #153 (Jon, 2026-06-17)

---

## Table of Contents

1. [Retention Guarantee Verification](#1-retention-guarantee-verification)
2. [Existing Re-Extract Path](#2-existing-re-extract-path)
3. [Dv / bomVersion Machinery & Prior-Version Retention](#3-dv--bomversion-machinery--prior-version-retention)
4. [Match-Key Mechanism](#4-match-key-mechanism)
5. [ECO Diff Prior Art](#5-eco-diff-prior-art)
6. [Gap Analysis & New Infrastructure Required](#6-gap-analysis--new-infrastructure-required)

---

## 1. Retention Guarantee Verification

**Verdict: ACHIEVABLE — but only by carrying fields forward from the matched prior row, not by preserving them through re-extraction. The existing re-extract path destroys all edit-work unconditionally. #153 builds a new path around it.**

### Complete inventory of edit-work fields on a BOM row

Every field below is **lost** when the current Re-Extract path runs (it replaces `panel.bom` wholesale). The reconciliation modal must carry these forward on UNCHANGED and carried-forward CHANGED rows.

#### Tier 1 — User-visible edit-work (loss = feature failure)

| Field(s) | Set by | Line(s) | Carry-forward rule |
|----------|--------|---------|-------------------|
| `isCrossed`, `crossedFrom`, `autoReplaced` | Cross/alternate application | 10686 | Carry on PN-UNCHANGED. Clear on PN-CHANGED (D1). |
| `isDescriptionCross`, `descriptionCrossFrom` | Description-DB cross | 10719 | Same as above. |
| `isCorrection`, `correctionFrom`, `correctionType`, `correctedByLibrary` | Correction DB | 10700 | Carry on PN-UNCHANGED. Clear on PN-CHANGED. |
| `unitPrice`, `priceDate`, `priceSource` | BC sync / manual / AI / scraper | 26040, 14922, etc. | Carry on PN-UNCHANGED. Clear on PN-CHANGED (D1 — pricing is keyed to PN). |
| `bcMatchType`, `bcVendorNo`, `bcVendorName`, `bcPoDate`, `bcItemId`, `bcItemNumber` | BC pricing pipeline | 14925 | Carry on PN-UNCHANGED. Clear on PN-CHANGED. |
| `bcVerify` | BC verification state | 15008 | Carry on PN-UNCHANGED. Clear on PN-CHANGED. |
| `leadTimeDays`, `leadTimeSource`, `leadTimeUpdatedAt`, `leadTimeEstimated` | Supplier / BC / manual / AI | 14959, 25567 | Carry on PN-UNCHANGED. Clear on PN-CHANGED. |
| `customerSupplied` | User toggle | 25820 | Carry always (it's a user flag on the row, not PN-dependent). |
| `isLaborRow`, `_manualLabor` | Labor system | 1217 | Labor rows are excluded from reconciliation entirely (not extracted). |
| `confidence`, `_confDowngradeReason` | Extraction + #146 re-promotion | 10686, 12117 | **Do NOT carry.** Fresh extraction produces fresh confidence. Re-promotion (#146/149) re-applies on load. |

#### Tier 2 — System metadata (loss = minor degradation, auto-recoverable)

| Field(s) | Set by | Carry-forward rule |
|----------|--------|-------------------|
| `ecoTag`, `ecoOp`, `ecoNumber`, `ecoModifiesBaseRowId`, `ecoOriginal` | ECO system | Carry if row is unchanged. ECO rows are scoped by `ecoTag` — reconciliation should only touch base BOM rows (`!r.ecoTag`). |
| `suspectQty`, `suspectQtyReason` | Extraction-time heuristic | Do NOT carry — fresh extraction re-flags. |
| `isContingency`, `autoLoaded` | Default-item system | Auto-loaded rows are not extracted — carry through as-is (they're in the current BOM, not in the new extraction). |
| `autoAddedCompanion`, `companionOfPartNumber` | Companion-split | Do NOT carry — fresh extraction re-splits companions. |
| `y_top`, `y_bottom`, `x_left`, `x_right`, `sourcePageIdx`, `sourcePageId` | Extraction position | Take from new extraction (new drawing positions). |

#### Tier 3 — Transient / auto-refreshed (no carry needed)

| Field(s) | Reason |
|----------|--------|
| `supplierStockQty`, `supplierStockSource` | Refreshed on next scraper run. |
| `aiBasis`, `aiSources` | Only meaningful with `priceSource:"ai"` — lost with price. |
| `_mfrCode` | Transient BC lookup field. |
| `cpdCategory` | Capstone classification — auto-derived. |
| `snippetCorrected` | Extraction audit flag — fresh extraction re-runs audit. |

### Carry-forward implementation shape

For an UNCHANGED row (PN + Qty match): take the **prior row object in full** (preserving its `id` and all enrichment), but update extraction-position fields (`y_top`, `y_bottom`, `sourcePageIdx`, `sourcePageId`) from the new extraction match. Confidence fields are NOT carried — `migrateProjectShape` re-promotes on load.

For a CHANGED row with PN UNCHANGED but Qty changed (D1): same as UNCHANGED — carry all enrichment, update `qty` from new extraction.

For a CHANGED row with PN CHANGED (D1): take new extraction values, clear all cross/pricing/BC/lead-time fields. This row is effectively a new item.

For a NEW row: take raw extraction values. Auto-apply crosses + corrections + BC pricing in the post-commit pipeline (same as initial extraction).

For a DELETED row user chooses to KEEP: carry the prior row in full, no changes.

---

## 2. Existing Re-Extract Path

### Current flow: `runExtraction()` at line 24770

1. **Snapshot** (line 24781): If BOM has rows, calls `saveSnapshot()` — stores BOM + pricing + validation + laborData to `{projectPath}/_snapshots/{timestamp}`. Max 10 retained.
2. **Clear derived data** (lines 24788-24798): Nulls `laborData`, `validation`, `bomVerification`, `bomAudit`, `extractionReport`.
3. **Extract** (lines 24820-24894): BOM pages → `extractBomBatchViaServer` (or per-page fallback) → raw extraction items.
4. **Post-extraction pipeline** (lines 24897-24946): Positional merge → exact dedup → fuzzy merge → non-BOM filtering → internal PN resolution → apply corrections → apply crosses → companion split → snippet correction.
5. **Replace BOM** (line 24982): `panel.bom = bom` — **complete replacement**. All prior rows gone.
6. **Save + auto-price** (lines 24984-24989, 24996-25027): Immediate save, then auto-runs pricing in background.

### Confirmation dialog (lines 29386-29403)

> "This will overwrite the current BOM, pricing, and validation data with a fresh extraction. Any manual edits will be lost."

### #153 does NOT modify this path

The existing Re-Extract button continues to work as-is for users who want a clean slate. #153 adds a **new** flow:

- **Trigger**: dropping revised drawings onto a panel that already has an extracted BOM
- **Flow**: `addFiles` → extract new pages → open Reconciliation Modal → user resolves → gated commit writes new BOM + bumps Dv

The new flow intercepts at the extraction-complete stage, before BOM replacement. Instead of overwriting, it opens the reconciliation UI.

### `addFiles()` behavior (line 23752)

`addFiles` **appends** new pages to `panel.pages` (line 23885). It does not replace existing pages. After page-type detection, it calls `runExtractionTask()` which extracts BOM items. Today, `runExtractionTask` also replaces the BOM.

**#153 intercept point**: After `addFiles` finishes extraction but before the BOM replacement, detect that this panel already has an edited BOM and open the Reconciliation Modal instead of auto-replacing. Alternatively, `addFiles` can proceed normally (appending pages), and a separate "Reconcile" button opens the modal using the newly extracted items vs. the current BOM.

**Recommendation**: The cleanest approach is to let `addFiles` append pages and extract to a **staging area** (not `panel.bom`), then open the reconciliation modal. This avoids modifying the hot path of `addFiles` and keeps the existing flow intact for panels without a BOM.

---

## 3. Dv / bomVersion Machinery & Prior-Version Retention

### Current state

**bomVersion (Dv.#)**: Per-panel number at `panel.bomVersion`. Bumped by `_bumpBomVersionIfChanged()` (line 8661) when `_computeDvBomHash()` detects a PN/Qty change.

**`_computeDvBomHash()`** (line 8646): Hashes `{pn: partNumber.trim(), q: qty}` for all non-labor rows. Excludes price, lead time, description, manufacturer. A reconciliation commit that changes any PN or Qty will auto-bump Dv via the existing save path.

**quoteRev (Qv.#)**: Project-level. Bumped by `_computeQuoteHash()` which includes price, description, lead time, etc. A reconciliation that changes prices/descriptions will auto-bump Qv too.

### Prior-version data retention — GAP IDENTIFIED

**Snapshot system** (`saveSnapshot` at line 9008): Stores BOM, pricing, validation, laborData, and status. **Does NOT store pages, drawings, or PDF references.** Max 10 per project, FIFO cleanup.

**Original PDFs**: Stored in Firebase Storage at `originalPdfs/{uid}/{projectId}/{timestamp}_{filename}.pdf`. These persist forever — uploading a revised drawing set creates new files with new timestamps. Old PDFs are never deleted.

**Page images**: Stored at `pageImages/{uid}/{projectId}/{pageId}.jpg`. Old page images persist in Storage even after pages are removed from `panel.pages`.

**The gap**: There is **no version-indexed archive** that links a specific Dv.# to its drawings + BOM together. The snapshot system captures BOM-only. The Storage files persist independently but are not linked to a version number.

### What "PREVIOUS VERSIONS" needs

The Brief calls for a "PREVIOUS VERSIONS" button surfacing prior drawings, scanned PDFs, and BOM. This requires a **new versioned snapshot record** that captures:

```
{
  dvVersion: N,                    // the Dv.# being archived
  createdAt: timestamp,
  reason: "Drawing revision (Dv.5 → Dv.6)",
  bom: [...],                      // full BOM array (deep copy)
  pageRefs: [                      // references to existing Storage files
    { pageId, storageUrl, originalPdfPath, pageNumber, name, types }
  ],
  laborData: {...} | null,
  panelId, panelName
}
```

**Storage cost is negligible**: `pageRefs` are pointers (URLs) to already-retained Storage files — no data duplication. The BOM deep-copy is the only significant data, and even a 200-row BOM serializes to ~50KB.

**Recommendation**: Store at `{projectPath}/_dvHistory/{dvVersion}` — separate from the existing `_snapshots` subcollection (which has its own lifecycle/cleanup rules and doesn't carry page refs). Alternatively, extend `_snapshots` with a `dvVersion` field and `pageRefs`, but this risks the 10-snapshot FIFO cleanup deleting version history that should be permanent.

**My recommendation: new `_dvHistory` subcollection.** It has a different retention policy (keep forever, keyed by version number) and a different schema (includes page refs). Mixing it with the operational snapshot system creates lifecycle conflicts.

---

## 4. Match-Key Mechanism

### Primary key: Normalized Part Number

**`normPart()`** (line 46777): `(s||'').replace(/[\s\-\.]/g,'').toUpperCase()`

Strips spaces, hyphens, periods, and uppercases. This is the same normalizer the ECO diff uses (line 16844). It handles common formatting variations:

| Raw PN | Normalized |
|--------|-----------|
| `1756-OB16E` | `1756OB16E` |
| `1756-ob16e` | `1756OB16E` |
| `1756 OB16E` | `1756OB16E` |

### Match algorithm (recommended three-pass)

**Pass 1 — Exact normPN match (high confidence)**

Build maps: `currentBOM → Map<normPN, row[]>` and `newExtraction → Map<normPN, item[]>`. Match by normPN. When a normPN appears in both maps:
- **Single row each side**: Direct match. Compare qty → UNCHANGED or CHANGED.
- **Multiple rows same PN**: See "duplicate PN" handling below.

Unmatched rows from the new extraction after Pass 1 go to Pass 2.

**Pass 2 — Position + description fallback (medium confidence)**

For unmatched new-extraction rows AND unmatched prior rows, attempt matching by `(sourcePageIdx, y_top proximity)` + description similarity. This catches rows where the PN was corrected by the user (the prior row has `correctionFrom` + `isCorrection` and a different displayed PN, but the new extraction has the original OCR'd PN).

**Important**: A correction-matched row should read as CHANGED (PN changed), not Delete+Add. The modal should show the prior corrected PN alongside the new raw PN so the user can decide.

**Pass 3 — Unmatched residuals**

- New-extraction rows with no match → NEW.
- Prior BOM rows with no match → DELETED candidates.

### Failure modes

| Scenario | What happens | Severity | Mitigation |
|----------|-------------|----------|------------|
| **User corrected PN** (e.g. `1756-OB16E` → `1756-OB16EHL`) | normPN differs → Pass 1 misses. Pass 2 catches by position+desc. | Medium | Position fallback. If position also drifted, reads as Delete+Add — user manually resolves. |
| **Duplicate PNs in same BOM** (e.g. two `1756-OB16E` on different line items) | `normPN → row[]` has 2+ entries. Cannot determine which new row matches which prior row. | High | **Positional disambiguation**: within the duplicate-PN group, match by `(sourcePageIdx, y_top)` proximity. If positions also match (same page, same area), fall back to **itemNo** (drawing line number). Log ambiguous matches for user review. |
| **Position drift** (item moved on the page but PN unchanged) | normPN match succeeds (Pass 1) — position is not part of primary key. | None | Primary key is PN, not position. Position is only a fallback. |
| **PN reformatting by AI** (e.g. `1756OB16E` extracted as `17560B16E` — zero vs O) | normPN differs but still wrong. | High | This is an extraction error, not a matching error. The row reads as NEW (and the old row as DELETED). User resolves manually. The cross/correction on the prior row is lost — but the user's Correction DB still has it and will auto-apply to the new row in the post-commit pipeline. |
| **Row split/merge** (AI splits one line into two, or merges two into one) | Split: one prior row → two new rows (one matches by PN, one is NEW). Merge: two prior rows → one new row (one matches, one is DELETED). | Medium | Correct behavior — user reviews the split/merge in the modal. |
| **All-new extraction** (completely different drawing set) | Every prior row is DELETED, every new row is NEW. | None | Works correctly — user either accepts all or cancels. |
| **Labor rows in match** | Labor rows are NOT extracted — they live outside the BOM extraction pipeline. | None | Exclude `isLaborRow` from both sides of the match. Carry labor rows through unconditionally. |
| **ECO rows in match** | ECO-tagged rows should not participate in base-BOM reconciliation. | None | Exclude rows with `ecoTag` from matching. Carry ECO rows through unconditionally. |
| **Auto-loaded contingency rows** (`isContingency`, `autoLoaded`) | These are not extracted — they're injected by the default-item system. | None | Exclude from matching. Carry through unconditionally. |

### Why position-only matching is insufficient as primary key

Drawing revisions often reflow the BOM table — rows shift up/down, new rows insert in the middle. Position (`y_top`) is unstable across revisions. Using position as primary key would produce false Delete+Add pairs for rows that simply moved. **PN must be primary.**

### normPN uniqueness in practice

In typical industrial BOM panels, part numbers are unique per panel >95% of the time. Duplicates occur for:
- Consumables (wire, cable) ordered in multiple lengths/colors — same base PN, different descriptions
- Items appearing on multiple drawing sheets (already deduped by extraction pipeline)

The duplicate-PN handling (positional disambiguation within the group) covers these cases.

---

## 5. ECO Diff Prior Art

The ECO system already has a BOM diff mechanism at line 16837 (`ecoDiff` useMemo). It provides a direct pattern for #153:

### What it does

1. Builds `extractMap` from ECO-extracted items (Map<normPN, {qty, partNumber, desc, mfr, ...}>)
2. Builds `baseMap` from current panel BOM (Map<normPN, {qty, row}>), excluding labor and ECO-tagged rows
3. Classifies: **adds** (in extract, not in base), **modifies** (in both, qty differs), **autoMatched** (in both, qty matches), **removes** (in base, not in extract)

### What #153 reuses vs. extends

| ECO Diff aspect | #153 treatment |
|-----------------|---------------|
| `normPart()` as match key | **Reuse directly** — same normalizer. |
| Aggregate qty per normPN (sums duplicate-PN rows) | **Extend** — #153 needs per-row matching, not per-PN aggregation. Duplicate PNs must resolve to individual rows. |
| Classify as add/modify/remove | **Reuse pattern** — same three categories, plus UNCHANGED (ECO's `autoMatched`). |
| Checkbox selection UI (adds/modifies default ON, removes default OFF) | **Adapt** — #153 uses explicit Accept/Reject/Delete/Keep per row, not checkboxes. All actionable rows must be resolved. |
| `diffSelections` state map | **Adapt** — #153 uses a resolution-state map (`Map<rowKey, "accepted"|"rejected"|"deleted"|"kept">`), not boolean toggles. |
| No carry-forward of edit-work | **Extend** — this is #153's core value-add. ECO diff creates new ECO rows; #153 carries forward the matched prior row's enrichment. |

### Key difference: ECO diff operates on aggregated-PN level; #153 operates on individual rows

ECO diff sums quantities across all rows with the same normPN before comparing. This works for ECOs (which model net changes to the BOM) but is wrong for #153 (which must reconcile individual line items with their individual enrichment).

---

## 6. Gap Analysis & New Infrastructure Required

### What exists and is reusable

| Component | Location | Reusable? |
|-----------|----------|-----------|
| `normPart()` normalizer | 46777 | Yes — as primary match key |
| `_computeDvBomHash()` | 8646 | Yes — Dv auto-bump on commit works as-is |
| `_bumpBomVersionIfChanged()` | 8661 | Yes — fires on `saveProject`/`saveProjectPanel` |
| `saveSnapshot()` | 9008 | Yes — pre-reconciliation safety snapshot |
| `addFiles()` page append | 23752 | Yes — new drawings append without replacing |
| `runExtraction()` extraction pipeline | 24770 | Partial — extraction + post-processing reusable, BOM-replacement step is what #153 intercepts |
| ECO diff pattern | 16837 | Pattern only — needs per-row (not per-PN-aggregate) adaptation |
| Existing "↩ Restore" button + snapshots UI | 27744-27842 | Yes — safety net if reconciliation goes wrong |
| `uploadOriginalPdf()` | 10438 | Yes — revised PDFs auto-retained in Storage |

### What must be built new

| Component | Why |
|-----------|-----|
| **Reconciliation match engine** | Per-row three-pass matching (normPN → position+desc → unmatched). ECO diff is per-PN-aggregate — wrong granularity. |
| **Reconciliation Modal** | New modal UI. ECO diff UI is close but has different interaction model (checkboxes vs. explicit per-row resolution with gated commit). |
| **Extraction staging area** | New extraction results must be held separately from `panel.bom` until commit. Today `runExtraction` replaces `panel.bom` directly. |
| **Carry-forward logic** | Field-by-field merge: prior-row enrichment + new-extraction position data. ~15 fields to carry, ~10 to replace, ~5 to clear conditionally. |
| **`_dvHistory` subcollection** | Version-indexed archive with BOM + page refs. Existing `_snapshots` has wrong lifecycle (FIFO 10-cap, no page refs). |
| **PREVIOUS VERSIONS modal** | New read-only modal listing prior Dv versions with their drawings + BOM. No existing UI for this. |
| **`addFiles` interception** | Detect "panel already has extracted BOM" → route new extraction to staging → open reconciliation. Alternatively, a post-`addFiles` trigger. |
| **Post-commit pipeline** | After reconciliation commit: apply crosses + corrections + BC pricing to NEW rows (same pipeline as initial extraction lines 24897-24946), trigger auto-pricing, bump Dv. |

### Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Match engine false-negative (real match missed → Delete+Add) | Medium | User sees both rows in the modal and can manually override. Correction DB auto-applies to the "new" row post-commit. |
| Match engine false-positive (wrong row matched) | Low — normPN is highly discriminating | Position fallback only runs on unmatched rows, not as override. User reviews every match in the modal. |
| Carry-forward misses a field | High — this is the retention guarantee | Detailed field inventory above. Implementation should use a spread-then-override pattern: `{...priorRow, qty: newQty, y_top: newY, ...}` rather than cherry-picking fields. |
| `_dvHistory` Firestore cost | Low | One doc per Dv bump, ~50KB each. Typical project has <10 revisions. |
| Large BOM reconciliation perf | Low | 200-row BOM × 3-pass matching is O(n²) worst case ≈ 40K comparisons — sub-ms in JS. Modal render is a flat list. |
| Concurrent save during reconciliation | Medium | The modal should hold a local copy; commit writes via `onSaveImmediate` with the usual save guards. Same as ECO editor pattern. |

---

## Summary of Verified Assumptions

| Brief assumption | Verified? | Notes |
|------------------|-----------|-------|
| Retention is achievable | **YES** | By carrying prior-row objects forward on match. 15+ fields per row. Full inventory in §1. |
| Re-extract path exists to build on | **YES** | `runExtraction()` at 24770. #153 reuses its extraction pipeline but intercepts before BOM replacement. |
| Dv bump on commit | **YES** | `_bumpBomVersionIfChanged()` auto-fires on save when PN/Qty hash changes. No new machinery needed. |
| Prior-version drawings/BOM retained | **PARTIALLY** | PDFs persist in Storage forever. BOM snapshots exist (max 10, no page refs). **New `_dvHistory` subcollection needed** for version-indexed archive with page refs. |
| Match by PN, fallback to position | **VERIFIED FEASIBLE** | `normPart()` exists. ECO diff is prior art. Three-pass algorithm covers corrected-PN, duplicate-PN, and position-drift cases. Failure modes documented. |
| ECO rows excluded | **YES** | ECO diff already excludes `ecoTag` rows from base map (line 16868). Same filter applies. |
| Labor/contingency rows excluded | **YES** | Labor is `isLaborRow`, contingency is `isContingency`/`autoLoaded`. Neither is extracted — carry through unconditionally. |
