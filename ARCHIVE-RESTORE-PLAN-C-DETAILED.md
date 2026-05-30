# Milestone C — Detailed Implementation Plan

**Based on:** ARCHIVE-RESTORE-BRIEF.md v1.1, ARCHIVE-RESTORE-PLAN.md v4, ARCHIVE-RESTORE-PLAN-C-SUPPLEMENT.md
**Repo state:** v1.20.27, commit `a9ff5390`, master
**Author:** CCD (Claude Code Desktop)
**Status:** Implemented (v1.20.28–v1.20.38). Cost Source Hotfix applied v1.20.37-v1.20.38 — corrected drift comparison from ItemCard Unit_Cost to Purchase Prices Direct_Unit_Cost. See ARCHIVE-RESTORE-PLAN-C-COST-SOURCE-HOTFIX.md.
**Scope:** Archive Browser + Restore Preview + Reference Drift Detection (read-only milestone — no writes to Firestore or BC)

---

## Table of Contents

1. [Deliverable Summary](#1-deliverable-summary)
2. [File/Module Structure](#2-filemodule-structure)
3. [Function Signatures and Pseudocode](#3-function-signatures-and-pseudocode)
4. [Implementation Sequence](#4-implementation-sequence)
5. [UI Surface Specifications](#5-ui-surface-specifications)
6. [Drift Detection Specifics](#6-drift-detection-specifics)
7. [Pre-Implementation Refactors](#7-pre-implementation-refactors)
8. [Test Approach](#8-test-approach)
9. [Open Questions](#9-open-questions)

---

## 1. Deliverable Summary

Milestone C is entirely read-only from the BC and Firestore perspective. It adds:

| Component | Purpose | Writes anything? |
|-----------|---------|------------------|
| `ArchiveBrowserModal` | List, search, sort archived projects | No |
| `buildRestorePreview()` | Drift detection against live BC data | No (reads BC via OData) |
| `RestorePreviewModal` | Visualize drift, remap UI, labor rate review | No (local state only) |
| `bcLookupCustomer()` | Direct BC customer filter (new helper) | No |
| `bcLookupVendor()` | Direct BC vendor filter (new helper) | No |
| Drift result cache | In-memory, keyed by archiveId, 5-min TTL | No |
| Gear menu entry | "📦 Archived Projects" for writers | No |
| Settings button | "Show Archived Projects" link for writers | No |

The Restore and Copy buttons are rendered but **disabled** in Milestone C — clicking shows "Coming in next update." Wiring them to `executeRestore()`/`executeCopyToNewQuote()` is Milestone D/E work.

---

## 2. File/Module Structure

All code lives in `src/app.jsx`. No new files.

### New Functions

| Function | Placement | Lines (approx) | Purpose |
|----------|-----------|-----------------|---------|
| `bcLookupCustomer(customerNumber, opts)` | After `bcLoadAllCustomers` (~line 3806) | ~20 | Direct BC customer filter: `$filter=number eq '...'&$top=1` |
| `bcLookupVendor(vendorNo, opts)` | After `bcListVendors` (~line 5265) | ~20 | Direct BC vendor filter: `$filter=number eq '...'&$top=1` |
| `buildRestorePreview(archive, opts)` | After `loadArchives` (~line 8885) | ~120 | Progressive drift detection across Items, Customer, Vendors |
| `ArchiveBrowserModal` | After `BulkArchiveModal` (~line 39970) | ~180 | Full-page modal: archive list with search/sort, action buttons |
| `RestorePreviewModal` | After `ArchiveBrowserModal` | ~250 | Drift visualization, remap controls, labor rate inputs |

### Modified Functions/Areas

| Location | Change |
|----------|--------|
| `bcFetchItemCardCosts` (line 4899) | Add optional `{signal}` last parameter for AbortController |
| Gear menu (line 42808) | Add "📦 Archived Projects" entry, gated by `canWrite()` equivalent (`userRole!=="view"`) |
| Settings archive section (line 38209) | Add "Show Archived Projects" button below existing "Archive All Projects" |
| Settings `SettingsModal` props (line 42941) | Add `onShowArchiveBrowser` callback prop |
| Modal rendering area (line 42942) | Add `ArchiveBrowserModal` and `RestorePreviewModal` conditional renders |
| State declarations (near line 41730) | Add `showArchiveBrowser`, `showRestorePreview`, `restorePreviewArchive` state |
| Constants area (~line 680) | Add `COST_DRIFT_THRESHOLD = 0.05` |

---

## 3. Function Signatures and Pseudocode

### 3.1 `bcLookupCustomer` — New BC Helper

```js
async function bcLookupCustomer(customerNumber, opts)
```
- `customerNumber`: string — BC customer number from the archive
- `opts`: `{signal?: AbortSignal}` — optional, for AbortController cancellation
- **Returns:** `{number, displayName}` or `null`

**Why not reuse `bcLoadAllCustomers`:** That function uses `$top=500` and would produce false-missing results for companies with >500 customers. A false-missing customer **hard-blocks restore** per the plan's blocking rule. Direct filter is a single call and definitive.

**Pseudocode:**
```
if !_bcToken or !customerNumber → return null
compId = await bcGetCompanyId()
if !compId → return null
url = `${BC_API_BASE}/companies(${compId})/customers?$filter=number eq '${customerNumber}'&$top=1&$select=number,displayName`
r = fetch(url, {headers: {Authorization}, signal: opts?.signal})
if r.status === 429 → retry with exponential backoff (1s, 2s, 4s) per bcSyncPanelPlanningLines pattern
if !ok or empty → return null
return {number, displayName} from first result
```

**429 retry (R8):** Both `bcLookupCustomer` and `bcLookupVendor` implement exponential backoff on 429 responses (1s, 2s, 4s — same pattern as `bcSyncPanelPlanningLines` at line 3469). Without this, a 429 mid-vendor-loop would silently fall into the error path, showing a red error state for a transient rate limit. Max 3 retries per call; on exhaustion, fall through to the error path as normal.

### 3.2 `bcLookupVendor` — New BC Helper

```js
async function bcLookupVendor(vendorNo, opts)
```
- `vendorNo`: string — BC vendor number
- `opts`: `{signal?: AbortSignal}` — optional
- **Returns:** `{number, displayName}` or `null`

**Why not reuse `bcGetVendorMap`:** That function uses `bcListVendors()` which has `$top=500`. Same ceiling risk as customers — a company with >500 vendors would produce false-missing results. Direct filter avoids this.

**Pseudocode:**
```
if !_bcToken or !vendorNo → return null
compId = await bcGetCompanyId()
if !compId → return null
url = `${BC_API_BASE}/companies(${compId})/vendors?$filter=number eq '${vendorNo}'&$top=1&$select=number,displayName`
r = fetch(url, {headers: {Authorization}, signal: opts?.signal})
if r.status === 429 → retry with exponential backoff (1s, 2s, 4s)
if !ok or empty → return null
return {number, displayName} from first result
```

### 3.3 `bcFetchItemCardCosts` — Signal Refactor

Current signature: `async function bcFetchItemCardCosts(partNumbers)`

New signature: `async function bcFetchItemCardCosts(partNumbers, opts)`

- `opts`: `{signal?: AbortSignal}` — optional, threaded through to each `fetch()` call
- All existing callers pass no second argument → no breakage
- Internal `fetch()` calls get `signal: opts?.signal` in their options

### 3.3a `bcFetchPurchasePricesMultiVendor` — New Function (Cost Source Hotfix v1.20.37)

```js
async function bcFetchPurchasePricesMultiVendor(partNumbers, opts)
```
- `partNumbers`: array of BC part numbers
- `opts`: `{signal?: AbortSignal}` — optional, for AbortController cancellation
- **Returns:** `Map<"partNumber:vendorNo", {directUnitCost, startingDate, uom}>`

Batch-fetch Purchase Prices from BC, keyed by `partNumber:vendorNo`. Returns ALL vendor records per part (no dedup across vendors — unlike `bcFetchPurchasePrices` which keeps only the most-recent vendor). Within each `(part, vendor)` pair, keeps the most recent `Starting_Date` record (H4: null date → epoch 0). Same OData query and 30-item batching as `bcFetchPurchasePrices`. Separate function to avoid disrupting existing callers of `bcFetchPurchasePrices` (line 4633, pricing sync).

**Rationale (Cost Source Hotfix):** The original F2 decision deferred `bcFetchPurchasePrices` to Milestone D and locked drift detection to `bcFetchItemCardCosts.Unit_Cost` vs `archivedRow.bcItemCardCost`. This was wrong: (1) `bcItemCardCost` is never stored on BOM rows — it's a computed field in pricing audit results only; (2) ItemCard `Unit_Cost` is a placeholder in Jon's BC environment — `Direct_Unit_Cost` from Purchase Prices is the real operational cost. See `ARCHIVE-RESTORE-PLAN-C-COST-SOURCE-HOTFIX.md` for full diagnosis.

### 3.4 `buildRestorePreview` — Core Drift Detection

```js
async function buildRestorePreview(archive, opts)
```
- `archive`: full archive document from `loadArchives()`
- `opts`: `{signal?: AbortSignal, onSectionDone?: (sectionName, result) => void}`
- **Returns:** `{items, customer, vendors, laborRates, errors[]}`

**Pseudocode (progressive load):**

```
// 0. Check cache (R3: per-section staleness, R4: bcTokenFingerprint)
cached = _restorePreviewCache.get(archive.archiveId)
if cached && cached.bcTokenFingerprint === bcTokenFingerprint(_bcToken):
  // Per-section staleness: each section has its own fetchedAt. Only re-fetch
  // sections whose individual TTL has expired. Fresh sections are returned from cache.
  // This aligns with the section-level retry design — a section that was retried
  // 2 minutes ago stays fresh even if other sections are stale.
  freshSections = {}
  staleSections = []
  for sectionName of ["items", "customer", "vendors"]:
    entry = cached.sections[sectionName]
    if entry && (Date.now() - entry.fetchedAt < PREVIEW_CACHE_TTL):
      freshSections[sectionName] = entry.result
      onSectionDone(sectionName, entry.result)
    else:
      staleSections.push(sectionName)
  if staleSections.length === 0:
    onSectionDone("labor", cached.labor)
    return cached  // fully fresh
  // Fall through to re-fetch only stale sections (implementation detail)

// 1. Extract unique references from archive (R6: build vendorNameMap during extraction)
uniquePartNumbers = Set()  // from all panels[].bom[].bcPartNumber || partNumber
customerNumber = archive.bcCustomerNumber
uniqueVendorNos = Set()     // from all panels[].bom[].bcVendorNo (filter blanks)
vendorNameMap = Map()        // Map<vendorNo, vendorName> — O(1) lookup, avoids O(vendors×rows)
panelLaborRates = []        // {panelId, panelName, archivedRate: panel.pricing?.laborRate || 0}

for each panel in archive.panels:
  for each row in panel.bom:
    pn = row.bcPartNumber || row.partNumber
    if pn: uniquePartNumbers.add(pn)
    if row.bcVendorNo:
      uniqueVendorNos.add(row.bcVendorNo)
      if !vendorNameMap.has(row.bcVendorNo): vendorNameMap.set(row.bcVendorNo, row.bcVendorName || "")
  panelLaborRates.push({panelId: panel.id, panelName: panel.name, archivedRate: panel.pricing?.laborRate || 0})

// 2. Labor rates — immediate, no BC call
laborResult = panelLaborRates
onSectionDone("labor", laborResult)

// 3. Customer — fast (1 BC call)
try:
  customerResult = null
  if customerNumber:
    liveCustomer = await bcLookupCustomer(customerNumber, {signal})
    if !liveCustomer:
      customerResult = {status: "missing", archivedName: archive.bcCustomerName, liveName: null}
    else if liveCustomer.displayName !== archive.bcCustomerName:
      customerResult = {status: "name_changed", archivedName: archive.bcCustomerName, liveName: liveCustomer.displayName}
    else:
      customerResult = {status: "ok", archivedName: archive.bcCustomerName, liveName: liveCustomer.displayName}
  else:
    customerResult = {status: "no_customer", archivedName: null, liveName: null}
  onSectionDone("customer", customerResult)
catch e:
  if e.name === "AbortError": throw e  // modal closed, bubble up
  customerResult = {status: "error", message: e.message}
  onSectionDone("customer", customerResult)

// 4. Vendors — fast (3-8 calls, sequential with 300ms pacing)
vendorResults = []
try:
  for vendorNo of uniqueVendorNos:
    liveVendor = await bcLookupVendor(vendorNo, {signal})
    archivedName = vendorNameMap.get(vendorNo) || ""  // R6: O(1) lookup from pre-built map
    if !liveVendor:
      vendorResults.push({vendorNo, status: "missing", archivedName, liveName: null})
    else if liveVendor.displayName !== archivedName:
      vendorResults.push({vendorNo, status: "name_changed", archivedName, liveName: liveVendor.displayName})
    else:
      vendorResults.push({vendorNo, status: "ok", archivedName, liveName: liveVendor.displayName})
    await sleep(300)  // rate-limit pacing
  onSectionDone("vendors", vendorResults)
catch e:
  if e.name === "AbortError": throw e
  vendorResults.push({status: "error", message: e.message})
  onSectionDone("vendors", vendorResults)

// 5. Items — CORRECTED by Cost Source Hotfix (v1.20.38)
// Fetch BOTH ItemCard (existence+description) and PurchasePrices (cost drift) in parallel.
// Graceful degradation (H2): each fetch catches independently. AbortError re-throws.
itemResults = []
try:
  partNumberArr = Array.from(uniquePartNumbers)
  [itemCostMap, ppMap] = await Promise.all([
    bcFetchItemCardCosts(partNumberArr, {signal}),         // existence + description
    bcFetchPurchasePricesMultiVendor(partNumberArr, {signal})  // vendor-specific cost drift
  ])
  // (H2: each wrapped in independent .catch — if one fails, the other's data is still usable)

  for pn of partNumberArr:
    liveItem = itemCostMap.get(pn)
    archivedRow = firstRowByPn.get(pn)
    archivedVendor = archivedRow.bcVendorNo

    // Live cost: vendor-specific Direct_Unit_Cost from Purchase Prices
    ppKey = `${pn}:${archivedVendor}`
    livePp = ppMap.get(ppKey)
    liveCost = livePp ? livePp.directUnitCost : null
    costSource = livePp ? "purchase_price" : "none"

    // Fallback: if no purchase price for this vendor, use ItemCard Unit_Cost
    if liveCost == null && liveItem:
      liveCost = liveItem.unitCost
      costSource = "item_card_fallback"

    // Archived cost: unitPrice (only price field stored on BOM rows)
    archivedCost = archivedRow.unitPrice
    legacyFallback = archivedRow.priceSource !== "bc"  // H1: priceSource reflects last operation, not last edit

    // Cost drift (R2: separate field). Skip if PurchasePrices failed (H2).
    costStatus = ppFetchFailed ? "cost_check_unavailable" : "ok"
    if !ppFetchFailed && liveCost != null && archivedCost != null && archivedCost !== 0:
      delta = (liveCost - archivedCost) / archivedCost
      if Math.abs(delta) > COST_DRIFT_THRESHOLD: costStatus = "cost_drift"

    // Description drift (R2: separate field)
    descStatus = "ok"
    if liveDesc && archivedDesc && liveDesc !== archivedDesc: descStatus = "description_changed"

    itemResults.push({partNumber, costStatus, descStatus, archivedCost, liveCost, delta,
      archivedDescription, liveDescription, legacyFallback, costSource, archivedVendor})

  onSectionDone("items", itemResults)
catch e:
  if e.name === "AbortError": throw e
  // Partial results may exist
  onSectionDone("items", {results: itemResults, error: e.message})

// 6. Cache result (R3: per-section fetchedAt, R4: bcTokenFingerprint)
_restorePreviewCache.set(archive.archiveId, {
  sections: {
    items: {result: itemResults, fetchedAt: Date.now()},
    customer: {result: customerResult, fetchedAt: Date.now()},
    vendors: {result: vendorResults, fetchedAt: Date.now()}
  },
  labor: laborResult,
  bcTokenFingerprint: bcTokenFingerprint(_bcToken)
})

return {items: itemResults, customer: customerResult, vendors: vendorResults, laborRates: laborResult}
```

### 3.5 Preview Cache

```js
// Module-level cache
let _restorePreviewCache = new Map();
// archiveId → {sections: {items, customer, vendors}, labor, bcTokenFingerprint}
// Each section entry: {result, fetchedAt} — per-section TTL (R3)

const PREVIEW_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// R4: Synchronous token fingerprint for cache-key comparison.
// NOT a security hash — only used to detect token changes (re-auth, disconnect/reconnect).
// Slicing first+last 8 chars is sufficient to detect a different token without storing
// or comparing the full bearer token in memory. If _bcToken is null/undefined, returns "".
function bcTokenFingerprint(token) {
  if (!token || token.length < 16) return token || "";
  return token.slice(0, 8) + ":" + token.slice(-8);
}

// R3: Per-section staleness check. Each section has its own fetchedAt, so a section
// that was retried (and thus refreshed) 2 minutes ago stays fresh even if other
// sections were fetched 6 minutes ago. This aligns with the section-level retry design.
function isSectionStale(sectionEntry) {
  return !sectionEntry || (Date.now() - sectionEntry.fetchedAt > PREVIEW_CACHE_TTL);
}

// Invalidation points:
// 1. On BC token change (_bcToken assignment): _restorePreviewCache.clear()
// 2. On successful restore/copy completion: _restorePreviewCache.delete(archiveId)
// 3. On manual refresh click in RestorePreviewModal: _restorePreviewCache.delete(archiveId)
```

**Placement:** Near other module-level caches. The `_vendorMapCache` at line 5291 is a precedent for this pattern.

### 3.6 Restore Lock Check (Pre-Preview)

Before opening `RestorePreviewModal`, the archive browser checks the lock.

**R5 (correctness): Must re-fetch the archive document from Firestore** — the in-memory `archive` object was loaded by `loadArchives()` when the browser was last opened/refreshed. Under real concurrency, another user could have written `restoreLock` after our last fetch. Reading the stale in-memory copy would miss the lock and allow two users into the preview simultaneously.

```js
// Pseudocode — inside ArchiveBrowserModal's "Restore" / "Copy" button handler
async function handlePreviewOpen(archive, mode) {
  // R5: Fresh Firestore read — do NOT trust the in-memory archive.restoreLock
  setLockChecking(true);
  try {
    const freshDoc = await fbDb.doc(
      `companies/${_appCtx.companyId}/projects_archive/${archive.archiveId}`
    ).get();
    if (!freshDoc.exists) {
      // Archive was deleted between list load and click — surface error
      setLockBlockInfo({error: "Archive no longer exists. Refresh the list."});
      return;
    }
    const freshLock = freshDoc.data().restoreLock;

    // Check restore lock BEFORE opening the preview modal
    // (This is the advisory early check per supplement §2.2a)
    if (freshLock) {
      const lockAge = Date.now() - freshLock.lockedAt;
      const STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
      if (lockAge < STALE_THRESHOLD && freshLock.lockedBy !== user.uid) {
        // HARD BLOCK — show dialog, do NOT open preview
        setLockBlockInfo({
          lockedByName: freshLock.lockedByName,
          lockedAt: freshLock.lockedAt
        });
        return;
      }
    }
  } catch (e) {
    console.warn("[ARCHIVE] lock check failed:", e.message);
    // Fail-open: if the lock check itself fails (network, permissions),
    // allow the preview to open. The lock is advisory in Milestone C;
    // authoritative lock acquisition happens at confirm time (Milestone D).
  } finally {
    setLockChecking(false);
  }
  // No lock / stale lock / same user / check failed → open preview
  setRestorePreviewArchive(archive);
  setRestorePreviewMode(mode); // "restore" | "copy"
  setShowRestorePreview(true);
}
```

Note: The lock is READ but NOT ACQUIRED here. Lock acquisition happens at confirm time (Milestone D). The fresh Firestore read (R5) makes the advisory check reliable under concurrency — it catches the common case of another user actively restoring, based on Firestore truth rather than cached UI state.

---

## 4. Implementation Sequence

### Phase 1: Pre-implementation refactors (parallel-safe, can land first)

| Step | What | Risk | LOC |
|------|------|------|-----|
| 1a | Add `{signal}` parameter to `bcFetchItemCardCosts` | None — additive, optional param | ~8 |
| 1b | Add `COST_DRIFT_THRESHOLD = 0.05` constant | None — new constant | 1 |

### Phase 2: New BC helpers

| Step | What | Risk | LOC |
|------|------|------|-----|
| 2a | Add `bcLookupCustomer(customerNumber, opts)` | Low — new function, no existing callers | ~20 |
| 2b | Add `bcLookupVendor(vendorNo, opts)` | Low — new function, no existing callers | ~20 |

### Phase 3: Core logic

| Step | What | Risk | LOC |
|------|------|------|-----|
| 3a | Add `_restorePreviewCache` and helpers | Low — module-level Map | ~15 |
| 3b | Add `buildRestorePreview(archive, opts)` | Medium — complex orchestration | ~120 |

### Phase 4: UI — ArchiveBrowserModal

| Step | What | Risk | LOC |
|------|------|------|-----|
| 4a | Add state variables (`showArchiveBrowser`, etc.) | Low | ~5 |
| 4b | Add gear menu entry | Low — insert in existing menu | ~3 |
| 4c | Add Settings "Show Archived Projects" button | Low | ~5 |
| 4d | Build `ArchiveBrowserModal` component | Medium — new component | ~180 |
| 4e | Wire modal in the render area | Low | ~2 |

### Phase 5: UI — RestorePreviewModal

| Step | What | Risk | LOC |
|------|------|------|-----|
| 5a | Build `RestorePreviewModal` component | Medium — complex UI | ~250 |
| 5b | Wire modal in the render area | Low | ~2 |
| 5c | Disable Restore/Copy confirm buttons with "Coming in next update" | Low | ~5 |

### Phase 6: Wiring + integration

| Step | What | Risk | LOC |
|------|------|------|-----|
| 6a | Wire `handlePreviewOpen` in ArchiveBrowserModal | Low | ~15 |
| 6b | Wire cache invalidation on `_bcToken` changes | Low — add line to existing token assignment site | ~2 |

### Total estimated LOC: ~650 lines of new/modified code

### Scope checker note
Every new function must declare its identifiers in scope. The scope checker runs before every deploy. Any new identifier referenced in JSX must be in the enclosing function's scope chain — watch especially for:
- State setters used inside `ArchiveBrowserModal` / `RestorePreviewModal` that are declared in the parent component
- Callback props that thread through multiple component levels
- Module-level helpers (`buildRestorePreview`, `bcLookupCustomer`, etc.) — these are function-scoped in the app.jsx IIFE but globally reachable within it, so the scope checker should be fine with them

---

## 5. UI Surface Specifications

### 5.1 ArchiveBrowserModal

**Entry points (two, per GAP 2 resolution):**

1. **Gear menu** — new entry between "🧠 ARC AI Database" and "📋 Customer Templates":
   ```
   📦 Archived Projects
   ```
   - Gated by `userRole!=="view"` (matches `canWrite()` — edit + admin)
   - On click: `setShowArchiveBrowser(true); setShowGearMenu(false);`
   - Highlight color: `#10b981` (green, matching the archive section in Settings)

2. **Settings modal** — new button in the archive section (line 38209):
   ```
   [Archive All Projects]  [Show Archived Projects]
   ```
   - "Show Archived Projects" button is `canWrite()` gated (edit + admin can see it)
   - "Archive All Projects" remains admin-only (unchanged)
   - On click: calls `onShowArchiveBrowser()` prop → closes Settings, opens browser

**Modal layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ 📦 Archived Projects                              [✕ Close] │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🔍 Search by name or BC project number...              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Sort: [Archived Date ▾] [Name] [BC Project #]              │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ PRJ402107 — Main Control Panel Job                    │   │
│ │ BC# P-2025-0107  │  Archived: May 15, 2026           │   │
│ │ By: jon@matrixpci.com  │  Restored: 0 times          │   │
│ │ BC Env: MATR_SndBx_01152026                           │   │
│ │                                                       │   │
│ │ [🔄 Restore]  [📋 Copy to New Quote]  [🗑 Delete]    │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌───────────────────────────────────────────────────────┐   │
│ │ PRJ402108 — Remote I/O Upgrade                        │   │
│ │ ...                                                   │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ Showing 78 archived projects                                │
└─────────────────────────────────────────────────────────────┘
```

**Behavioral details:**

| Aspect | Spec |
|--------|------|
| **Data source** | `loadArchives()` — already exists (line 8872). Returns all complete archives, ordered by `archivedAt` desc |
| **Loading state** | Spinner on first open. Archives cached in component state (not module-level — re-fetches on each modal open to pick up new archives) |
| **Search** | Client-side filter on `archive.name`, `archive.originalBcProjectNumber`. Case-insensitive `.includes()`. Applied as user types (debounced 200ms) |
| **Sort** | Three options: `archivedAt` desc (default), `name` alpha, `originalBcProjectNumber` alpha. Toggle direction on second click |
| **Row action: Restore** | Gated by `userRole!=="view"`. Calls `handlePreviewOpen(archive, "restore")` — checks lock, then opens `RestorePreviewModal` |
| **Row action: Copy to New Quote** | Gated by `userRole!=="view"`. Calls `handlePreviewOpen(archive, "copy")` — checks lock, then opens `RestorePreviewModal` |
| **Row action: Delete** | Gated by `userRole==="admin"`. **Milestone C does not implement delete.** Button is disabled with tooltip "Coming in a future update" |
| **Empty state** | "No archived projects found. Use Settings → Archive All Projects to create archives before a BC Database reset." |
| **Lock block dialog** | If `handlePreviewOpen` detects a non-stale cross-user lock, show inline dialog (not a separate modal): "This archive is being restored by [User Name]. Please wait until they finish before attempting restore. (Started N minutes ago.) [OK]" |
| **Restore history badge** | Each archive card shows `archive.restoreHistory.length` with label "Restored N times" |

**Style:** Matches existing full-screen modal pattern (see `BulkArchiveModal` at line 39943). Background `rgba(0,0,0,0.82)`, card background `#0d0d1a`, accent border, glowing box shadow.

### 5.2 RestorePreviewModal

**Triggered by:** clicking "Restore" or "Copy to New Quote" in `ArchiveBrowserModal`.

**Props:**
```js
function RestorePreviewModal({archive, mode, uid, onClose})
```
- `archive`: full archive document
- `mode`: `"restore"` | `"copy"`
- `uid`: current user UID
- `onClose`: callback

**Modal layout (progressive load):**

```
┌─────────────────────────────────────────────────────────────┐
│ 🔄 Restore: PRJ402107 — Main Control Panel Job    [✕ Close] │
│   (or "📋 Copy to New Quote: ...")                          │
│                                                             │
│ ⚠ BC Connection Required                     [only if !BC] │
│ [Connect to Business Central to preview drift]              │
│                                                             │
│ ── Customer ─────────────────────────────────────────────── │
│ ✅ ACME Corp (#C-1001) — found in BC                       │
│                              -or-                           │
│ 🔴 ACME Corp (#C-1001) — missing from BC                   │
│    [Remap to: __________ ▾]                                 │
│    ⚠ Customer must be mapped before restore can proceed    │
│                              -or-                           │
│ 🟡 Customer #C-1001 — name changed: "ACME Corp" → "Acme"  │
│    [Accept current name] (default — no action needed)       │
│                              -or-                           │
│ 🔴 Error checking customer — BC unavailable [Retry]        │
│                              -or-                           │
│ ⏳ Checking customer...                                     │
│                                                             │
│ ── Vendors (6 unique) ───────────────────────────────────── │
│ ✅ 4 matched                                                │
│ 🔴 Allied Electric (#V-201) — missing from BC              │
│    [Accept as-is] [Remap to: ______ ▾]                     │
│ 🟡 Graybar (#V-105) — renamed: "GrayBar" → "Graybar Elec" │
│    [Accept current name]                                    │
│                              -or-                           │
│ ⏳ Checking vendors (3/6)...                                │
│                                                             │
│ ── Items (80 unique parts) ──────────────────────────────── │
│ ✅ 72 matched                                               │
│ 🔴 3 missing from BC                                        │
│    AB-1234 "Contactor 30A"     [Remap ▾] [Skip]            │
│    CD-5678 "Relay 24VDC"       [Remap ▾] [Skip]            │
│    EF-9012 "Terminal Block"    [Remap ▾] [Skip]            │
│ 🟡 4 with cost drift > 5%                                  │
│    GH-3456  $12.50 → $14.20 (+13.6%) [Accept current]      │
│    IJ-7890  $8.00 → $6.50 (-18.8%)  [Accept current]       │
│    ...                                                      │
│ ⚪ 1 with no cost in BC                                     │
│    KL-2345  (item exists, Unit_Cost = 0) [Accept]           │
│                              -or-                           │
│ ⏳ Checking items (60/80)...  ████████████░░░░ 75%          │
│                                                             │
│ ── Labor Rates (per panel) ──────────────────────────────── │
│ Panel 1 — Main CP         $[45.00] /hr                      │
│ Panel 2 — Remote I/O      $[45.00] /hr                      │
│ Panel 3 — HMI Enclosure   $[52.00] /hr                      │
│ (editable — adjust rates before confirming)                 │
│                                                             │
│ ── ECO Handling ───────────────── [only for Copy mode       │
│                                    when ecoCounter > 0]     │
│ ○ Combine into base BOM                                     │
│ ○ Keep ECOs separate                                        │
│                                                             │
│         [Cancel]  [Restore ▸] (disabled until Milestone D)  │
│                                                             │
│ ⚠ Restore/Copy will be enabled in the next update.         │
│   This preview lets you review drift before proceeding.     │
└─────────────────────────────────────────────────────────────┘
```

**Behavioral details:**

| Aspect | Spec |
|--------|------|
| **Progressive load** | Modal shell renders immediately. Labor rates populate instantly (no BC call). Customer section populates within ~500ms. Vendor section fills progressively (~2s for 6 vendors). Items section loads last (~3s for 80 unique parts — 3 batches of 30 via `bcFetchItemCardCosts` only). Each section independently shows loading → result/error |
| **AbortController** | Created on modal mount. All BC calls receive `{signal: controller.signal}`. On close: `controller.abort()` — cancels in-flight fetches. `AbortError` caught and silently ignored (no error state, no cache write) |
| **Section error + retry** | Each section can independently error. Red error state: "Could not check [section] — Business Central unavailable. [Retry]". Retry refetches only the errored section. Cache preserves successful sections |
| **Restore button state** | Disabled in Milestone C. Tooltip: "Restore will be available in the next update." Button enables in Milestone D |
| **Restore button blocking rule (Milestone D preview)** | Disabled if: (a) any section is still loading, (b) any section errored, (c) customer is missing and not remapped. All other missing references are non-blocking |
| **BC disconnected** | If `!_bcToken` on mount: show "BC Connection Required" with blue link/button to trigger BC auth. All sections show "Waiting for BC connection..." instead of loading. Customer, Vendors, Items sections stay in pending state. Labor rates still show (no BC needed) |
| **Customer remap** | Dropdown populated by `bcLoadAllCustomers()`. Loaded lazily (only when user clicks "Remap"). Selected customer's `number` replaces `archive.bcCustomerNumber` in the remaps object. This is acceptable here because the remap selector is a convenience UI — we're selecting FROM the available customers, not checking IF one exists |
| **Vendor remap** | Same lazy-load dropdown pattern. `bcListVendors()` called on first remap click |
| **Item remap** | Dropdown populated by typing (search-as-you-type against `bcLookupItem`). Debounced 400ms. Shows part number + description in dropdown. **R7: Session-scoped search cache** — results cached in a `Map<searchQuery, results>` within the modal's component state. Subsequent searches for the same or longer prefix (e.g., "ABC" → "ABCD") first filter the cached result client-side before issuing a new BC call; a new call is only made if the cached result was truncated or the prefix doesn't narrow. This bounds BC quota cost to ~1 call per unique prefix rather than per keystroke, keeping a multi-item remap session under ~10-15 BC calls instead of 50+ |
| **Item skip** | Clicking "Skip" on a missing item sets `remaps.items[pn].action = "skip"`. In Milestone D, this translates to `restoreSkipped: true` on the BOM row |
| **Labor rate inputs** | Number inputs, defaulting to archived values. User edits are stored in local state. In Milestone D, these feed into `options.laborRateOverrides: {panelId: newRate}` |
| **ECO handling radios** | Only shown when `mode === "copy"` AND `archive.ecoCounter > 0`. Default: "Keep ECOs separate". Selection stored in local state. Feeds into Milestone D's `options.ecoMode` |
| **Remaps state shape** | Maintained as local `useState` in `RestorePreviewModal`: `{items: {[pn]: {action: "skip"|"remap", remapTo?: string}}, customer: {action: "accept"|"remap", remapTo?: string}, vendors: {[vendorNo]: {action: "accept"|"remap", remapTo?: string}}}` |

### 5.3 Gear Menu Entry

Insert after the "🧠 ARC AI Database" entry (line 42808), before the "📋 Customer Templates" entry (line 42809):

```jsx
{userRole!=="view"&&<button onClick={()=>{setShowArchiveBrowser(true);setShowGearMenu(false);}}
  style={{display:"block",width:"100%",textAlign:"left",
    background:showArchiveBrowser?"#0a1a14":"none",
    border:"none",color:"#10b981",cursor:"pointer",
    padding:"8px 16px",fontSize:13,fontWeight:700}}
  onMouseEnter={e=>{if(!showArchiveBrowser)e.target.style.background="#1a1a2e";}}
  onMouseLeave={e=>{if(!showArchiveBrowser)e.target.style.background="none";}}>
  📦 Archived Projects
</button>}
```

**Gate:** `userRole!=="view"` — matches `canWrite()` behavior (edit + admin). This is the same pattern used by the "📋 Customer Templates" entry on line 42809.

### 5.4 Settings Archive Section — Restructured (F3 Clarification)

**Problem:** The existing archive section (line 38204-38209) is fully gated by `isAdmin() && onShowBulkArchive`. Wrapping "Show Archived Projects" inside that block would hide it from edit-role users, contradicting the GAP 2 resolution (both entry points are `canWrite()`-visible).

**Solution:** Restructure into a single cohesive block with mixed permission gates. The section is visible to all writers (`canWrite()` = edit + admin). The "Archive All Projects" button inside is further gated by `isAdmin()`.

**Current code (line 38204-38209):**
```jsx
{/* Admin: Archive Tools — DECISION(v1.20.23) */}
{isAdmin()&&onShowBulkArchive&&(
  <div style={{marginTop:20,padding:"14px 16px",background:"#0a1a14",border:"1px solid #10b98133",borderRadius:10}}>
    <div style={{...}}>📦 Project Archives <span>ADMIN</span></div>
    <div style={{...}}>Archive all projects before a BC Database reset...</div>
    <button onClick={()=>{onShowBulkArchive();onClose();}}>Archive All Projects</button>
  </div>
)}
```

**New structure:**
```jsx
{/* Archive Tools — DECISION(v1.20.23, F3 restructure) */}
{/* Section visible to all writers (canWrite), bulk archive button admin-only */}
{userRole!=="view"&&(
  <div style={{marginTop:20,padding:"14px 16px",background:"#0a1a14",border:"1px solid #10b98133",borderRadius:10}}>
    <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6,display:"flex",alignItems:"center",gap:8}}>
      📦 Project Archives
    </div>
    <div style={{fontSize:12,color:C.muted,lineHeight:1.5,marginBottom:10}}>
      Browse archived project snapshots. Restore into the current BC environment or copy to a new quote.
    </div>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {onShowArchiveBrowser&&<button onClick={()=>{onShowArchiveBrowser();onClose();}}
        style={btn(C.accent,"#fff",{fontSize:13,padding:"7px 18px"})}>
        Show Archived Projects
      </button>}
      {isAdmin()&&onShowBulkArchive&&<button onClick={()=>{onShowBulkArchive();onClose();}}
        style={btn("#10b981","#fff",{fontSize:13,padding:"7px 18px"})}>
        Archive All Projects
        <span style={{fontSize:10,fontWeight:600,color:"#10b981",background:"#052e16",
          borderRadius:10,padding:"1px 8px",marginLeft:6}}>ADMIN</span>
      </button>}
    </div>
  </div>
)}
```

**Key changes:**
- Outer gate: `userRole!=="view"` (replaces `isAdmin()&&onShowBulkArchive`)
- Section header: "📦 Project Archives" — no ADMIN badge (section is for all writers)
- "Show Archived Projects" button: visible to all writers, gated only by `onShowArchiveBrowser` prop
- "Archive All Projects" button: further gated by `isAdmin()&&onShowBulkArchive` — ADMIN badge on this button
- Description text updated to describe both actions (browse/restore, not just bulk archive)

**SettingsModal prop additions:**
- Current (line 42941): `onShowBulkArchive={companyId?()=>setShowBulkArchive(true):undefined}`
- Add: `onShowArchiveBrowser={companyId?()=>setShowArchiveBrowser(true):undefined}`

**Gear menu gate (confirmed correct):** The gear menu entry at §5.3 uses `userRole!=="view"` — this is `canWrite()` equivalent (edit + admin), matching the Settings section gate. ✅

---

## 6. Drift Detection Specifics

### 6.1 Query Strategy (per Supplement §2.1, CORRECTED by Cost Source Hotfix v1.20.38)

| Reference | BC Endpoint | Calls (80 unique parts, 1 customer, 6 vendors) | Pacing |
|-----------|-------------|--------------------------------------------------|--------|
| Items (existence + description) | OData ItemCard, 30/batch | 3 calls | Parallel with PurchasePrices |
| Items (cost drift) | OData PurchasePrices, 30/batch | 3 calls | Parallel with ItemCard |
| Customer | REST API `customers?$filter=number eq '...'` | 1 call | N/A |
| Vendors | REST API `vendors?$filter=number eq '...'` | 6 calls | 300ms between each |
| Labor rates | Local (no BC call) | 0 calls | N/A |

**Total:** ~13 BC calls. ItemCard + PurchasePrices run in `Promise.all` (net latency = slower of the two, not the sum). At 300ms vendor pacing: ~4 seconds total. Progressive rendering means user sees customer result within ~500ms.

### 6.2 Price Comparison Target (CORRECTED by Cost Source Hotfix v1.20.38)

Drift detection compares:
- **Live value:** `bcFetchPurchasePricesMultiVendor` result → `directUnitCost` (BC Purchase Prices `Direct_Unit_Cost`), matched on `(partNumber, bcVendorNo)` from the archived BOM row
- **Archived value:** `row.unitPrice` — the only price field stored on BOM rows
- **Fallback:** If no vendor-specific purchase price exists, falls back to ItemCard `Unit_Cost` with `costSource: "item_card_fallback"` and `legacyFallback: true`

**This is NOT apples-to-apples** (Direct_Unit_Cost is vendor-specific buy-side; unitPrice may include markup), but it is the best available comparison because `unitPrice` is the only numeric cost field stored on BOM rows. For `priceSource === "bc"` rows, `unitPrice` was written from `Direct_Unit_Cost` during the last pricing sync, so the comparison IS valid for the common case. For `priceSource !== "bc"` rows, `legacyFallback: true` flags the comparison as approximate.

**H1 known limitation:** `priceSource` reflects the last pricing *operation*, not the last edit. Manual edits after a BC re-verify leave `priceSource` as `"bc"` but `unitPrice` no longer represents BC cost. The UI tooltip notes this caveat.

### 6.3 Cost Drift Threshold

```js
const COST_DRIFT_THRESHOLD = 0.05; // 5%
```

**Placement:** Near `_pricingConfig` (line 1874). Named constant per plan §2, line 95.

**Formula:** `Math.abs((liveCost - archivedCost) / archivedCost) > COST_DRIFT_THRESHOLD`

Edge cases:
- `archivedCost === 0`: skip drift calculation (division by zero). Flag as "zero archived cost — review manually"
- `liveCost === 0 || liveCost === null`: flag as `zero_cost` — item exists but has no cost
- Both zero: status `"ok"` — no drift, both zero

### 6.4 Vendor Drift Scope (per Supplement §2.4)

Two fields compared:
1. **Existence:** Does the vendor number resolve? Missing → red flag
2. **Name:** Compare archived `bcVendorName` against current BC vendor `displayName`. Changed → yellow flag

Other vendor fields (contact, address, payment terms) are NOT compared — they don't affect restore data integrity.

### 6.5 Modal-Close Abort Pattern (per Supplement §2.2)

```js
// Inside RestorePreviewModal
const abortRef = useRef(null);

useEffect(() => {
  // Create AbortController on mount
  abortRef.current = new AbortController();
  
  // Start progressive load
  buildRestorePreview(archive, {
    signal: abortRef.current.signal,
    onSectionDone: (section, result) => {
      setSectionResults(prev => ({...prev, [section]: result}));
    }
  }).catch(e => {
    if (e.name !== "AbortError") console.warn("[RESTORE PREVIEW] unexpected error:", e);
  });
  
  return () => {
    // Abort all in-flight requests on unmount
    if (abortRef.current) abortRef.current.abort();
  };
}, [archive.archiveId]);
```

### 6.6 Cache Invalidation Points

| Event | Action |
|-------|--------|
| `_bcToken` changes (new auth, disconnect) | `_restorePreviewCache.clear()` |
| Successful restore/copy (Milestone D) | `_restorePreviewCache.delete(archiveId)` |
| User clicks "Refresh" in RestorePreviewModal | `_restorePreviewCache.delete(archiveId)`, re-run `buildRestorePreview` |
| TTL expires (5 min) | Stale check on cache read — refetch if stale |
| `loadArchives()` called | No invalidation — archive data doesn't change; only BC data does |

---

## 7. Pre-Implementation Refactors

These changes are safe to land before Milestone C UI work. They're additive (optional params) with zero impact on existing callers.

### 7.1 `bcFetchItemCardCosts` — Add Signal Support

**Current (line 4899):**
```js
async function bcFetchItemCardCosts(partNumbers){
```

**New:**
```js
async function bcFetchItemCardCosts(partNumbers, opts){
```

**Internal change:** Each `fetch()` call (line 4912) gets `signal: opts?.signal`:
```js
const r=await fetch(url,{headers:{...}, signal: opts?.signal});
```

### 7.2 ~~`bcFetchPurchasePrices` — Deferred to Milestone D Pre-Work~~ **SUPERSEDED by Cost Source Hotfix (v1.20.37)**

~~The `{signal}` refactor for `bcFetchPurchasePrices` is not part of Milestone C.~~

**This deferral was incorrect.** The F2 decision dropped `bcFetchPurchasePrices` from Milestone C based on the assumption that `bcFetchItemCardCosts.Unit_Cost` vs `archivedRow.bcItemCardCost` was a valid comparison. Both assumptions were wrong — `bcItemCardCost` is never stored on BOM rows, and `Unit_Cost` is a placeholder in Jon's BC environment.

**Resolution:** New function `bcFetchPurchasePricesMultiVendor` (v1.20.37) now provides vendor-specific `Direct_Unit_Cost` for drift detection. It has full `{signal}` support from day one. The existing `bcFetchPurchasePrices` function remains unchanged for its existing callers. See `ARCHIVE-RESTORE-PLAN-C-COST-SOURCE-HOTFIX.md` for full diagnosis and §3.3a above for the new function spec.

---

## 8. Test Approach

### 8.1 Smoke Tests — ArchiveBrowserModal

| # | Test | Expected |
|---|------|----------|
| 1 | Open via gear menu → "📦 Archived Projects" | Modal shows, lists all complete archives from `loadArchives()` |
| 2 | Open via Settings → "Show Archived Projects" | Same modal opens, same data |
| 3 | Search by project name | List filters to matching archives (case-insensitive) |
| 4 | Search by BC project number | List filters to matching archives |
| 5 | Sort by name | Archives reorder alphabetically |
| 6 | Sort by archived date (default) | Archives ordered newest-first |
| 7 | Empty state (no archives) | Shows "No archived projects found" message |
| 8 | **Permission: view-only user** | Gear menu does not show "📦 Archived Projects". Settings section does not show "Show Archived Projects" |
| 9 | **Permission: edit user** | Both entry points visible. Restore and Copy buttons enabled. Delete button disabled |
| 10 | **Permission: admin user** | All entry points visible. All buttons enabled except Delete (deferred) |

### 8.2 Smoke Tests — RestorePreviewModal (Drift Detection)

| # | Test | Expected |
|---|------|----------|
| 1 | Preview archive with all BC references intact | All green ✅. Customer ok, all items ok, all vendors ok |
| 2 | Preview archive where 1 item has been deleted from BC | Red 🔴 flag on that item. Remap and Skip buttons visible |
| 3 | Preview archive where 1 item's cost changed >5% | Yellow 🟡 flag with cost delta shown. "Accept current" button |
| 4 | Preview archive where customer is missing from BC | Red 🔴 flag. "Remap" dropdown available. Restore button would be disabled (Milestone D blocking rule) |
| 5 | Preview archive where 1 vendor is missing from BC | Red 🔴 flag. "Accept as-is" and "Remap" options |
| 6 | Preview archive where vendor name changed | Yellow 🟡 flag. "Accept current name" option |
| 7 | Labor rate section shows per-panel archived rates | Editable inputs with correct values from archive |
| 8 | Edit a labor rate field | Local state updates (no BC call). Value persists within modal session |
| 9 | **BC disconnected** | "BC Connection Required" shown. Customer/Items/Vendors show "Waiting for BC connection." Labor rates still visible |
| 10 | **Progressive load** | Labor rates appear instantly. Customer populates within ~500ms. Vendors fill progressively. Items section shows progress counter and fills last |

### 8.3 Smoke Tests — Abort and Cache

| # | Test | Expected |
|---|------|----------|
| 1 | Open preview, close modal while items are loading | No errors in console. `AbortError` silently caught. No stale state |
| 2 | Open preview, wait for full load, close, reopen same archive within 5 min | Cache hit — sections populate instantly from cache (no BC calls) |
| 3 | Open preview, wait for full load, wait >5 min, reopen | Cache stale — sections re-fetch from BC |
| 4 | Open preview, disconnect BC mid-load | Errored section shows red error with "Retry". Other sections that completed successfully are preserved |
| 5 | Click "Retry" on errored section | Only that section refetches. Successful sections stay cached |

### 8.4 Smoke Tests — Restore Lock Check

| # | Test | Expected |
|---|------|----------|
| 1 | Click Restore on archive with no lock | Preview opens normally |
| 2 | Click Restore on archive with stale lock (>5 min old) | Preview opens normally (stale lock is ignored) |
| 3 | Click Restore on archive with non-stale lock from SAME user | Preview opens normally (same-user resume path) |
| 4 | Click Restore on archive with non-stale lock from DIFFERENT user | Hard block dialog: "This archive is being restored by [Name]." No preview opens. No BC calls made |

### 8.5 Edge Cases

| # | Test | Expected |
|---|------|----------|
| 1 | Archive with 0 BOM rows (empty panels) | Items section: "No items to check." No BC item calls made |
| 2 | Archive with no customer number | Customer section: "No customer on archived project." Not treated as missing |
| 3 | Archive with no vendors in BOM | Vendors section: "No vendor references." No BC vendor calls made |
| 4 | Archive with 200+ unique parts | Item batching works correctly (7 batches of 30). Progress counter tracks accurately |
| 5 | Item exists in BC but `Unit_Cost` is 0 | Status `"zero_cost"`, white flag: "Item exists but has no cost in BC" |
| 6 | Legacy archive row with null `bcItemCardCost` | Falls back to `unitPrice` comparison. Info icon: "Cost comparison approximate" |
| 7 | `archivedCost === 0` | Drift calculation skipped. Info: "Zero archived cost — review manually" |
| 8 | ECO handling radios for Copy mode | Radios visible only when `mode==="copy"` AND `archive.ecoCounter > 0` |
| 9 | Copy mode without BC connection | BC sections show "BC Connection Required" but the "Copy to New Quote" button would be enabled (Milestone E — Firestore-only path) |
| 10 | Archive from a different BC environment | All item/customer/vendor references will be checked against current BC. Some may match (master data survives reset), some may be missing |

### 8.6 Scope Checker Verification

Before deploying, run:
```
node tools/check-scope.js
```

Expected: exit 0 (no new violations). All new functions (`bcLookupCustomer`, `bcLookupVendor`, `buildRestorePreview`, `ArchiveBrowserModal`, `RestorePreviewModal`) are module-level in app.jsx, so they're visible to all other functions. State variables (`showArchiveBrowser`, etc.) must be declared in the same component scope where they're used in JSX.

---

## 9. Open Questions

### Q-C1: Item Remap Search UX

The plan specifies a search-as-you-type dropdown for item remap. This requires calling `bcLookupItem` on each keystroke (debounced 400ms). For Milestone C, the remap UI exists but the Restore button is disabled — so the remap selection is "preview only" (user can see what they'd remap to, but can't execute).

**Question:** Should we implement the full search-as-you-type remap, or a simpler text input that's validated only in Milestone D? The simpler version reduces Milestone C scope. The full version lets users explore remap options during preview.

**Recommendation:** Implement full search-as-you-type. The preview is most useful when users can actually explore remap options. The `bcLookupItem` function already exists (line 4045) and handles the search.

### Q-C2: Customer Remap Dropdown Population

The customer remap dropdown uses `bcLoadAllCustomers()` which has a `$top=500` ceiling. For SELECTING a remap target (browsing available customers), this is acceptable — the user is choosing from a list, and 500 is enough for most companies. The `$top=500` is only dangerous for CHECKING existence (where missing-from-list ≠ missing-from-BC).

**Question:** Confirm that `bcLoadAllCustomers()` is acceptable for the remap dropdown, while `bcLookupCustomer()` (new, direct filter) is used for existence checking.

**Recommendation:** Yes, this split is correct. The remap dropdown is a convenience selector — if a customer is beyond position 500 in the alphabetical list, the user can type to filter. The existence check is the critical path and must use direct filter.

### Q-C3: `restoreSkipped` Visual Treatment

GAP 3 from the supplement notes this is unspecified. For Milestone C, skipped items in the preview show a "Skip" badge. The visual treatment of `restoreSkipped` rows in the BOM table (after restore) is a Milestone D concern.

**Proposed minimal spec for Milestone D (non-blocking for C):** Amber background on the BOM row + tooltip "Skipped during restore — item was missing from BC. Review and remap or mark customer-supplied." No filter or bulk action.

**No decision needed for Milestone C.**

---

## Appendix: Dependency Map

```
Phase 1 (refactors) ──┐
                       ├──→ Phase 3 (buildRestorePreview)
Phase 2 (BC helpers) ──┘           │
                                   ├──→ Phase 5 (RestorePreviewModal)
Phase 4 (ArchiveBrowserModal) ─────┤
                                   └──→ Phase 6 (wiring)
```

Phases 1+2 can land as a standalone commit (pre-implementation refactors).
Phases 3+4+5+6 are the Milestone C feature commit.

---

*End of Milestone C detailed plan. Route to Coach for verification, then Analyst for architectural review.*
