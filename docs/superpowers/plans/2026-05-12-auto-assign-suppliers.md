# Plan: ARC Auto-assign Suppliers (Stage 1 + Stage 2)

**Date:** 2026-05-12
**Worktree:** `claude/mystifying-dhawan-778665`
**Starting version:** v1.19.1022

## Goal

Learn the relationship between part manufacturer and chosen vendor/supplier from historical project BOMs, then auto-assign suppliers to rows on new BOMs where BC has no answer. Push confirmed assignments back to BC's `ItemVendorCatalog` so the next BOM extraction picks them up via the existing vendor-resolution path.

Example pattern: "User has historically sourced 47 ALLEN-BRADLEY items from CODALE → on next BOM, fill ALLEN-BRADLEY rows with vendor CODALE (with user confirmation)."

## Why this is needed

The existing post-pricing vendor backfill (`v1.19.1018`, commit 308956c) resolves vendor from BC's Item Card when BC already has a vendor on file for that item. It does NOT help when:

1. The item has no BC Item Card yet (new part numbers)
2. The Item Card exists but `Vendor_No` is blank
3. The Item Card vendor disagrees with the user's project-history-preferred vendor

Auto-assign fills these gaps using project BOM-row history as the source of truth, and writes the chosen vendor back to BC so future runs see it through the existing path.

## User decisions captured

| Decision | Value |
|---|---|
| Source of history | Projects' BOM rows (most-used vendor per manufacturer wins) |
| Manufacturer key | Free-text `manufacturer` field from Opus extraction + small alias normalizer |
| Multi-vendor handling | Modal lets user pick per-manufacturer |
| BC writeback timing | On user confirm in modal (NOT on RFQ send) |
| Scope | Staged: Stage 1 (learning + modal + row-only writes) → Stage 2 (BC ItemVendorCatalog writeback) |
| Modal scope | Across whole project (fills blanks on every panel, not just the just-extracted one) |
| Locks | Push through Hard Project Lock / Owner Priority — update regardless |
| Map rebuild trigger | Auto-rebuild on project marked complete + lazy one-time rebuild if doc missing |

## Architecture

### New Firestore collection

```
users/{uid}/config/manufacturerVendorMap
{
  records: {
    "ALLEN-BRADLEY": {
      manufacturer: "ALLEN-BRADLEY",
      vendors: {
        "V0042": { vendorNo: "V0042", vendorName: "CODALE", count: 47, lastUsedAt: <ts> },
        "V0078": { vendorNo: "V0078", vendorName: "REXEL",  count: 12, lastUsedAt: <ts> }
      },
      totalCount: 59
    },
    "PHOENIX-CONTACT": { ... },
    ...
  },
  rebuiltAt: <ts>,
  rebuiltFromProjectCount: <n>
}
```

Manufacturer key normalized via `_normalizeManufacturer(str)` (Stage 1.1).

### Manufacturer alias table (hardcoded, expandable)

```js
const _MFR_ALIASES = {
  "AB": "ALLEN-BRADLEY",
  "ALLEN BRADLEY": "ALLEN-BRADLEY",
  "ALLEN-BRADLEY": "ALLEN-BRADLEY",
  "ROCKWELL": "ALLEN-BRADLEY",  // Rockwell Automation = AB parent
  "SQUARE D": "SQUARE-D",
  "SQUARED": "SQUARE-D",
  "SCHNEIDER": "SCHNEIDER-ELECTRIC",
  "SCHNEIDER ELECTRIC": "SCHNEIDER-ELECTRIC",
  "PHOENIX": "PHOENIX-CONTACT",
  "PHOENIX CONTACT": "PHOENIX-CONTACT",
  "WAGO": "WAGO",
  "SIEMENS": "SIEMENS",
  "ABB": "ABB",
  "EATON": "EATON",
  "CUTLER-HAMMER": "EATON",
  "CUTLER HAMMER": "EATON",
  "AUTOMATION DIRECT": "AUTOMATIONDIRECT",
  "AUTOMATIONDIRECT": "AUTOMATIONDIRECT",
  "HOFFMAN": "HOFFMAN",
  "RITTAL": "RITTAL",
  "SAGINAW": "SAGINAW"
};
function _normalizeManufacturer(s){
  if(!s) return "";
  const k = String(s).trim().toUpperCase().replace(/[.,]/g,"").replace(/\s+/g," ");
  return _MFR_ALIASES[k] || k;
}
```

### Indexer

```js
async function rebuildManufacturerVendorMap(uid) {
  // Walk users/{uid}/projects/*, every panel.bom row
  // For rows with: manufacturer set AND bcVendorNo set AND !isLaborRow
  //   normMfr = _normalizeManufacturer(row.manufacturer)
  //   records[normMfr].vendors[row.bcVendorNo].count++
  //   records[normMfr].vendors[row.bcVendorNo].vendorName = row.bcVendorName
  //   records[normMfr].vendors[row.bcVendorNo].lastUsedAt = max(saveAt)
  //   records[normMfr].totalCount++
  // Save to users/{uid}/config/manufacturerVendorMap
}
```

Triggers:
- Lazy: in `getManufacturerVendorMap()`, if doc missing → run once + save
- Explicit: when project status flips to `complete` (in `setProjectStatus`) — fire-and-forget rebuild
- Manual: Settings → "Rebuild supplier learning" button (Stage 2)

### Analyzer

```js
function analyzeBomForVendorAutoAssign(project, mfrMap) {
  // Walk every panel in project, every row
  // Skip rows with: !manufacturer, bcVendorName already set, isLaborRow, qty===0
  // Group by _normalizeManufacturer(row.manufacturer)
  // For each manufacturer group, look up mfrMap.records[mfr]:
  //   0 vendors → no suggestion, leave blank
  //   1 vendor → suggestion = that vendor (any count)
  //   2+ vendors → suggestion = top vendor IF top has ≥3 count AND ≥70% share
  //                otherwise → "ambiguous" (user must pick from list)
  // Returns: { groups: [{ manufacturer, rows: [...], candidates: [{vendorNo, vendorName, count}], suggested: vendorNo|null, ambiguous: bool }] }
}
```

Auto-assignment rules:
| History | Action |
|---|---|
| 0 vendors | Leave blank, no modal entry |
| 1 vendor (any count) | Suggested (single radio pre-selected) |
| 2+ vendors, top ≥70% share AND ≥3 count | Suggested (top radio pre-selected) |
| 2+ vendors, no dominant winner | Ambiguous (no radio pre-selected, user must choose) |

### Modal UI: AutoAssignVendorsModal

Triggered:
- After post-extraction pricing/backfill completes, if any blank-vendor rows have a known-manufacturer suggestion
- Manually from toolbar pill

Layout:
- Title: "Auto-assign suppliers — N manufacturers, M rows"
- One section per manufacturer group, e.g.:
  ```
  ALLEN-BRADLEY    [12 rows in this project]
    (•) CODALE — 47 historical assignments      ← suggested
    ( ) REXEL — 12 historical assignments
    ( ) Other vendor… [type to search BC]
  ```
- Footer: [Skip] [Apply suggestions only] [Apply all]
- "Apply suggestions only" applies non-ambiguous picks, leaves ambiguous unselected
- Per-row override link (small "see rows" disclosure)

On confirm:
1. Update `bcVendorName` + `bcVendorNo` on every matching row in every panel of the current project (Stage 1)
2. Save project
3. Increment counts in `manufacturerVendorMap`
4. Toast: "Assigned N rows across M manufacturers"
5. **Stage 2 only:** Push to BC `ItemVendorCatalog` via `bcUpsertItemVendor()` per row; queue on offline via existing `bcEnqueue`

### Toolbar pill

```
[🔗 N rows need vendor]
```
- Amber background, white text
- Shown when current project has any row with `manufacturer` set + blank `bcVendorName`
- Click → opens AutoAssignVendorsModal in "review whole project" mode

### Stage 2 only: bcUpsertItemVendor()

Mirrors `bcUpsertItemVendorLeadTime()` but writes only:
```js
{
  Item_No: partNumber,
  Vendor_No: vendorNo,
  Vendor_Item_No: supplierPartNumber || undefined
}
```
No `Lead_Time_Calculation` field. GET → PATCH or POST patterns identical. Audit at `companies/{companyId}/bcVendorAssignments/{id}`.

BC offline: queue via existing `bcEnqueue("upsertItemVendor", {...}, "Auto-assign vendor X for part Y")`. Add handler in `bcProcessQueue()`.

## Stage breakdown

### Stage 1 (this session)
1. Manufacturer alias normalizer + `_normalizeManufacturer()` (~30 lines)
2. `getManufacturerVendorMap()` + lazy rebuild + `rebuildManufacturerVendorMap()` (~100 lines)
3. Auto-rebuild hook on `setProjectStatus(... "complete")` (~10 lines)
4. `analyzeBomForVendorAutoAssign()` (~80 lines)
5. `AutoAssignVendorsModal` component (~280 lines)
6. Toolbar pill + button (~40 lines)
7. Post-extraction trigger after BC backfill in `runPricingOnPanel` (~30 lines)
8. JSX validate + deploy

**Outcome of Stage 1:** Map exists and rebuilds. Modal opens after extraction. User confirms. Rows get `bcVendorName`/`bcVendorNo` set in the project. Map counts increment. **No BC writeback yet — local-only.**

### Stage 2 (next session)
1. `bcUpsertItemVendor()` helper (~80 lines)
2. Audit at `companies/{companyId}/bcVendorAssignments` (~30 lines)
3. BC offline queue handler `upsertItemVendor` in `bcProcessQueue()` (~20 lines)
4. Modal confirm wiring → BC writeback (~30 lines)
5. Failure surfacing (toast, audit entry with `outcome:"failed"`)
6. Settings button: "Rebuild supplier learning" (manual indexer trigger)

**Outcome of Stage 2:** Confirmed picks push to BC ItemVendorCatalog, so subsequent extractions see vendor via existing path. Offline-safe. Auditable.

## Acceptance criteria

### Stage 1
- [ ] On first BOM extraction in a fresh user account: no modal shown (empty map)
- [ ] After 1 project marked complete with vendors filled in: map rebuilds, contains those manufacturer→vendor counts
- [ ] On next BOM extraction: modal opens with suggestions for matched manufacturers, leaves others blank
- [ ] User confirm: all matching rows in the project get `bcVendorName`/`bcVendorNo` set, project save persists, map counts increment
- [ ] Reload project: assignments survive
- [ ] Toolbar pill appears when blank-vendor-with-known-mfr rows exist, hides when none
- [ ] Click pill: reopens modal
- [ ] Modal "Skip" closes without changes
- [ ] No regression in existing vendor-resolution path (BC Item Card vendor still wins when present pre-modal)

### Stage 2
- [ ] BC writeback succeeds → audit entry `outcome:"created"` or `"updated"`
- [ ] BC offline → queued; on reconnect, processes and audits with original timestamp + processed timestamp
- [ ] BC permission denied → audit `outcome:"failed"` with error, toast surfaces, row still has local assignment
- [ ] Next extraction on same item: existing `bcGetItemVendorNo` returns the vendor we wrote → no modal entry for that row

## Non-goals (out of scope)

- Cross-user learning (each user has their own map; companies/{cid}/manufacturerVendorMap is a possible Stage 3)
- Per-project-type segmentation (e.g. "low voltage uses different suppliers than control")
- Automatic alias detection (manual hardcoded table only; if user has a manufacturer name not in alias table, it's still keyed normally — just won't merge with variants)
- Confidence-based silent assignment (every assignment goes through modal — no silent fill in Stage 1; revisit in Stage 3 if desired)
- Vendor preference per project / customer

## Risks

- **Map size**: tens of thousands of manufacturer keys is unlikely but possible. If `records` grows >1MB, split into subcollection. Monitor.
- **Performance of indexer**: walking every project on every "complete" event could be slow for power users. Mitigation: indexer is incremental — start with full rebuild, switch to incremental in Stage 3.
- **Stale assignments**: if a user changes preferred vendor for a manufacturer, the map will lag. Mitigation: each confirmed pick increments counts → new preference catches up. Manual rebuild button (Stage 2) for hard reset.
- **JSX-fragment trap**: AutoAssignVendorsModal must use `<>...</>` per CLAUDE.md rule.

## Files touched

- `src/app.jsx` — all changes
- `docs/superpowers/plans/2026-05-12-auto-assign-suppliers.md` — this file
- No Cloud Function changes, no Firestore rule changes (config doc, default user-owned rules cover it)
