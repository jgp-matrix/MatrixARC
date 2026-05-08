# Control Panel Lead Time — Design Spec (v1)

**Status:** Ready for plan + implementation
**Date:** 2026-04-24
**Related:** Builds on Item Lead Times v1 (2026-04-23-item-lead-times-design.md). Every BOM row now carries `leadTimeDays` and a source — this feature consumes that data to produce a single answer: *"When can this control panel ship?"*

## Problem

Today sales types the Control Panel ship date into the quote by hand. They guess, or they ping production, or they add a safety buffer that may or may not be right. With item lead times landing reliably on every BOM row, ARC can now compute a defensible ship date from first principles and call out the items that are driving it — or flag that the **production schedule** is the binding constraint rather than material.

## Solution overview

Three coordinated pieces:

1. **New input — Production Days (from production)** — a number-of-days input next to Requested Ship Date on the quote/panel form. User-entered from production (how many additional days production needs AFTER panel assembly is complete — testing, QA, shipping prep, etc.).
2. **Computed — Control Panel Ship Date** — `today + longestItemLeadDays + laborDays + productionDays`. All three durations sum to give the soonest possible ship date, since the steps are sequential: material arrives → labor builds → production finishes. "Largest contributor" label shown so the reader knows which bucket is driving the total.
3. **Auto-populated Quote Note — Lead Drivers** — any BOM item whose lead time is GREATER than the BOM average gets listed in the quote's Notes area so the customer sees what items are pushing the commitment out.

**Out of scope:** Multi-panel rollup (one panel at a time for v1). Weekend/holiday skipping (calendar days only). Auto-fetching production days from a production scheduling system (manual entry only for v1).

## Data model

### New fields on panel (primary) and project.quote (rollup)

```js
{
  // existing
  requestedShipDate: "YYYY-MM-DD",
  // new
  productionDays: number | null,                   // duration in days — additional production
                                                   //   time AFTER panel assembly (QA, testing,
                                                   //   shipping prep). User-entered.
  controlPanelShipDate: "YYYY-MM-DD" | null,       // computed, user-overridable
  controlPanelShipDateOverride: boolean,           // true if user edited it manually
  controlPanelLeadDrivers: [                       // items above the BOM average lead time,
                                                   //   snapshot at compute time
    { partNumber: string, description: string, leadTimeDays: number, source: string },
    ...
  ],
  controlPanelLargestContributor: "material" | "labor" | "production"  // which bucket
                                                                        //   contributes most days
}
```

### Retention

All fields preserved on save per CLAUDE.md. Additive — no schema bump. Existing projects render with blank `productionDays` and no computed ship date until the user enters one.

## Calculation

```js
function computeControlPanelLeadTime(panel, project){
  const today = startOfDay(Date.now());

  // 1. Longest lead item across the BOM
  const bom = (panel.bom||[]).filter(r =>
    !r.isLaborRow &&
    !_isExcludedFromPriceCheck(r) &&
    (r.leadTimeDays||0) > 0
  );
  const longestItemDays = bom.reduce((max, r) => Math.max(max, +r.leadTimeDays||0), 0);

  // 2. Labor days = ceil(totalHours / dailyCrewHours)
  const lab = computeLaborEstimate(panel);
  const totalLaborHours = lab.totalHours || 0;
  const dailyCrewHours = project.laborConfig?.dailyCrewHours || 8;
  const laborDays = Math.ceil(totalLaborHours / dailyCrewHours);

  // 3. Production days — user-entered duration for post-assembly production work
  const productionDays = Math.max(0, +panel.productionDays || 0);

  // 4. SUM — soonest possible ship date (all three sequential)
  const totalDays = longestItemDays + laborDays + productionDays;
  const shipDate = today + totalDays * ONE_DAY;

  // 5. Which bucket is the single largest contributor?
  let largestContributor = "material";
  let largest = longestItemDays;
  if (laborDays > largest) { largestContributor = "labor"; largest = laborDays; }
  if (productionDays > largest) { largestContributor = "production"; largest = productionDays; }

  // 6. Lead drivers — items with leadTimeDays ABOVE the BOM average
  //    (null / 0 excluded so they don't drag the average down)
  const ldValues = bom.map(r => +r.leadTimeDays||0).filter(n => n > 0);
  const avg = ldValues.length ? ldValues.reduce((s,n) => s+n, 0) / ldValues.length : 0;
  const drivers = [...bom]
    .filter(r => (+r.leadTimeDays||0) > avg)
    .sort((a, b) => (+b.leadTimeDays||0) - (+a.leadTimeDays||0))
    .map(r => ({
      partNumber: r.partNumber,
      description: r.description,
      leadTimeDays: +r.leadTimeDays,
      source: r.leadTimeSource || "unknown",
    }));

  return {
    shipDate: isoDate(shipDate),
    leadDays: totalDays,
    longestItemDays,
    laborDays,
    productionDays,
    averageItemLeadDays: Math.round(avg * 10) / 10,
    drivers,
    largestContributor,
  };
}
```

### Rules

- **Sum semantics** — three durations add sequentially: material arrives → labor builds → production finishes. Result is the earliest date the panel can realistically ship.
- **Missing data handling:**
  - No lead times anywhere on BOM → `longestItemDays = 0`, `drivers = []`. Show a warning in the UI ("No item lead times — ship date may be optimistic").
  - `productionDays` blank or 0 → contributes 0 to the sum.
  - AI-estimated lead times (`leadTimeSource === "ai"`) contribute but are flagged in the Driver note with an asterisk (e.g. "Lead drivers: PN1 (45d*) — *AI estimate").
- **Labor rounding:** `Math.ceil(hours / dailyCrewHours)` — partial days round up.
- **Today's date:** use `startOfDay` so results are stable regardless of time-of-day.
- **Calendar days** only (no business-day mode in v1 — keep consistent with BC's DateFormula semantics).
- **Average for drivers:** computed across items with `leadTimeDays > 0` only (null / 0 entries excluded so they don't drag the average down artificially).

## Config

New config field at `users/{uid}/config/laborRates` (which already exists):

```js
{
  dailyCrewHours: 8   // number of productive labor hours per calendar day
}
```

Default 8 if not set. Admin can override in Settings → Config.

## UI

### Input — Production Days

Placed next to Requested Ship Date on the quote form AND on the panel detail form:

```
Requested Ship Date  [ YYYY-MM-DD ]    Production Days (after assembly)  [ 7 ]
```

Small number input (0–90 reasonable range). Optional — blank / 0 = no production time added. Tooltip: *"Days production needs AFTER panel assembly is complete (testing, QA, shipping prep). Enter what production tells you."*

### Computed — Control Panel Ship Date (displayed in Quote Summary)

No dedicated box or recompute button. The computed value is surfaced as a compact chip in each panel row of the Quote Summary, placed **to the LEFT of the status pill**:

```
│ 1 │ Panel Drawing Name                    │ 56d │ [Status] │ $12,400 │
│ 1 │ Panel Drawing Name (Open Qs)          │ 56d │ [? 3]    │ $12,400 │
```

**Chip styling:**
- Shows `{leadDays}d` (e.g. `56d`) — compact integer + unit
- Tooltip on hover: `Ship date: 2026-06-12 · 45d material + 4d labor + 7d production · largest: material`
- Color:
  - Default cyan — normal case
  - Amber — when the BOM has ANY AI-estimated lead times in the sum (value isn't firm)
  - Muted grey — when `longestItemDays === 0` AND `productionDays === 0` (only labor contributing — estimate weak)
  - Red — when `controlPanelShipDateOverride === true` AND override > computed by > 14 days (user has added meaningful buffer)
- Clicking the chip opens a small popover with the breakdown + an inline override/revert control:

```
┌──────────────────────────────────────────────┐
│ Control Panel Ship Date: 2026-06-12           │
│ 56 calendar days from today                   │
│                                               │
│ 45d material (longest: A303012LP — 45d)       │
│  4d labor   (32 hrs ÷ 8 hrs/day)              │
│  7d production                                 │
│                                               │
│ [ Override... ]                                │
└──────────────────────────────────────────────┘
```

"Override" reveals an inline date picker; saving sets `controlPanelShipDateOverride: true`. Computed value remains shown as a ghost with a "Revert to computed" link.

Live-updating — no manual recompute button anywhere. Every input change reflects immediately in the chip (debounced 500 ms).

### Auto-populated Quote Note

When the quote is rendered, append (or refresh) a line in the Notes field listing any BOM item whose lead time is GREATER THAN the BOM average:

```
Lead drivers (> 12d avg): A303012LP (45d) · 800H-1HVX7M1 (28d) · 140G-G6C3-C20 (21d) · PHXCT 2891035 (18d)
```

The number of items in the list is variable — however many are above average. Sorted longest-first.

Behavior:
- Append if not present. Refresh if present (match on the `Lead drivers` prefix).
- User edits after — ARC will preserve unless they click "Refresh lead driver note".
- AI-sourced entries get an asterisk and a footnote: `Lead drivers (> 12d avg): PN1 (45d*) · PN2 (28d) — *AI estimate`.
- If no items exceed the average (e.g. uniform BOM), the line is omitted.
- If BOM has fewer than 3 priced items, skip the driver note entirely — not meaningful.

## Pipeline

### Recomputation triggers

`computeControlPanelLeadTime` itself doesn't touch labor — it just reads `computeLaborEstimate(panel).totalHours`. But since labor hours feed directly into `laborDays`, a change to ANY labor input (data, override, or `dailyCrewHours` config) means a new ship date. The triggers below are the minimal set of inputs that re-fire the `useMemo` wrapping `computeControlPanelLeadTime`:

1. A BOM row's `leadTimeDays` or `leadTimeSource` changes (affects `longestItemDays` + drivers)
2. Labor inputs change — `panel.laborData` / `panel.validation.wireCount` / `pricing.laborHoursOverride` — these flow into `computeLaborEstimate.totalHours`
3. `productionDays` edited
4. `dailyCrewHours` config changes
5. BOM added / removed / row qty change (BOM average for driver note shifts)

No manual Recompute button. Live computation, debounced 500 ms — cheap in-memory work, no DB / API. `useMemo([panel.bom, panel.laborData, panel.validation?.wireCount, panel.pricing?.laborHoursOverride, panel.productionDays, laborConfig.dailyCrewHours])` is enough.

### Autosave

Computed fields persist on the panel doc so reports and printed quotes use the latest snapshot. `controlPanelLeadDrivers` snapshot is captured at compute time so the quote's printed note doesn't drift when someone changes a BOM row after printing.

## Batched BC writeback (refactors v1.19.693)

### Problem with current per-row debounce

Today the manual-edit BC writeback (v1.19.693) uses a per-row 2-second `setTimeout`. Editing 10 rows in a minute fires 10 separate `bcUpsertItemVendorLeadTime` calls, each GET-ing the existing record then PATCH/POST-ing. That's up to **20 BC round trips** for one user session of typing lead times, with commensurate audit-log bloat in `companies/{cid}/bcLeadTimeWrites`.

### New behavior

Consolidate into a single **30-second debounced batch queue**. The on-site Control Panel Lead Time computation stays live (in-memory, 500 ms) — only the BC sync is deferred.

**Queue shape:**
```js
// Module-level ref on the panel component
_leadTimeBcQueue = {
  pending: Map<rowId, { partNumber, vendorNo, vendorName, vendorItemNo, leadTimeDays, editedAt }>,
  flushTimer: timeoutId | null,
};
```

**Enqueue flow (on manual edit):**
1. Live on-site compute fires as before (useMemo, 500 ms)
2. If `_bcToken` + non-blank PN + leadTimeDays > 0: add (or replace) entry in `pending` map keyed by `rowId`
3. Clear any existing `flushTimer`; start a fresh 30-second timer
4. (Repeat on every keystroke — the timer keeps sliding forward until the user stops typing for 30s)

**Flush flow (after 30s of quiet, on explicit "Sync now", on unload, or on page navigation):**
1. Pop everything from `pending` into a local array
2. Resolve `bcVendorNo` for rows missing it (live lookup) — same fallback as bulk Push button
3. Walk the array sequentially, call `bcUpsertItemVendorLeadTime` per row
4. Roll up results → single toast: `"✓ 7 lead times synced to BC (1 failed)"`
5. Single consolidated audit entry per batch is NOT possible (audit writes one record per call by design), but batch results can be summarized in a console log for traceability

**User-visible state:**
- Amber pill in the BOM toolbar area: `⏳ N pending BC sync` — shown whenever `pending.size > 0`
- Click the pill → flush immediately (manual "Sync now")
- On page unload / route change / window blur: synchronous flush attempt (`navigator.sendBeacon` not available for this; rely on `visibilitychange` + immediate flush call — best-effort)

**Concurrency protection:**
- While a flush is in-flight, new edits enqueue into `pending` and the timer restarts. They'll go out in the next batch.
- Rapid edits on the same row → later value replaces earlier (Map key = rowId, so only one pending write per row).

**Batch still respects:**
- HARD REJECT blank partNumber
- Vendor resolution fallback (live lookup)
- `ItemVendorCatalog` Web Service published-check
- Audit trail to `bcLeadTimeWrites`

**Out of scope (existing paths untouched):**
- Bulk **📤 Push Lead Times to BC** button — stays immediate (user-initiated bulk action)
- Supplier portal Apply Prices — stays immediate (one click = one batch, predictable)
- Upload Supplier Quote push — stays immediate (same reason)

Only the **cell-level manual edit** path changes from per-row 2s to batched 30s.

### Config

Debounce window tunable via `laborRates.config.leadTimeBatchSeconds` (default 30). Admin-overridable for testing or for environments where BC write latency is an issue.

## Edge cases

- **Labor override in effect** — honor `pricing.laborHoursOverride`; `computeLaborEstimate` already handles this.
- **Empty BOM / zero labor / zero productionDays** — total is 0; shipDate = today. Show a warning banner ("No inputs — shipping estimate not meaningful").
- **Negative durations** — clamp to 0. (Shouldn't happen but defensive.)
- **Very large productionDays** — cap at 365 (one year) with a validation warning; prevents typos like "700" from producing absurd dates.
- **Lead driver with blank part number** — skip; exclude from drivers note.
- **Crossed items** (supplier sells different PN) — use the BOM row's original `partNumber` in the driver note, not the supplier's.
- **Uniform BOM** (all lead times equal) — no items above average → driver note omitted.
- **BOM with < 3 priced items** — driver note skipped entirely (average not statistically meaningful with so few data points).
- **Panel-level data vs project quote rollup** — each panel has its own `productionDays` + computed `controlPanelShipDate`. Project/quote level rollup = latest panel ship date; driver note aggregates across panels then applies the above-average filter to the combined list.

## Testing plan

1. **Basic sum:** BOM with 45d longest item, 32 hrs labor (4d at 8h/day), productionDays=7 → shipDate = today + 56d; largestContributor="material".
2. **Labor-dominated:** 10d longest item, 160 hrs labor (20d at 8h/day), productionDays=2 → shipDate = today + 32d; largestContributor="labor".
3. **Production-dominated:** 10d longest item, 8 hrs labor (1d), productionDays=21 → shipDate = today + 32d; largestContributor="production".
4. **Zero productionDays:** blank or 0 → contributes 0; total = material + labor only.
5. **Above-average drivers:** BOM with lead times `[2,3,4,5,45]` → avg=11.8; only 45d item exceeds → drivers list has 1 entry.
6. **Uniform BOM:** all leads = 14d → no items above average → driver note omitted.
7. **Small BOM:** 2 priced items → driver note skipped entirely (below 3-item threshold).
8. **AI-sourced driver:** above-average item is `leadTimeSource="ai"` → driver note shows asterisk + footnote.
9. **No lead times:** all leadTimeDays null → longestItemDays=0, drivers=[], warning banner shown, shipDate = today + labor + production only.
10. **Config honored:** `dailyCrewHours = 6` → labor days recomputed with /6 instead of /8.
11. **User override preserved:** manually set shipDate in chip popover → `controlPanelShipDateOverride=true`; change a BOM row → recompute updates the "ghost" suggestion but manual value stays.
12. **Revert to computed:** click link → override flag cleared, computed value restored.
13. **Live update:** edit `productionDays` from 7 to 14 → Quote Summary chip updates from `56d` to `63d` immediately (within 500 ms debounce) with no user action.
14. **Quote note append / refresh-in-place:** notes blank → driver line appended. Prior `Lead drivers` line present → replaced, not duplicated.
15. **Quote note preserved:** user edits driver line → no overwrite unless they click "Refresh".
16. **Multi-panel rollup:** project with 3 panels → project-level ship date = max of per-panel dates; driver note aggregates across all panels then applies above-average filter to combined list.
17. **Validation — productionDays > 365:** input clamped; warning shown.
18. **Chip color changes:** add an AI-sourced lead time → chip flips to amber. Remove AI entries → chip returns to cyan.
19. **Batched BC sync:** edit 5 lead times within 30s → ONE batch fires after 30s quiet → 5 writes, single toast. Pill shows `⏳ 5 pending BC sync` during the wait.
20. **Edit-then-edit-again:** edit row A (value 14), wait 20s, edit row A again (value 21) → only value 21 goes to BC (Map replaces), pill stays at `1 pending` not `2`.
21. **Manual Sync now:** click the `⏳ pending` pill → batch flushes immediately, timer cleared, pill disappears.
22. **On navigation:** edit 3 lead times, close tab within 30s → best-effort flush fires on `visibilitychange`. Verify via `bcLeadTimeWrites` audit log that the writes landed (or at least attempted).
23. **Config override:** set `leadTimeBatchSeconds = 10` → flush after 10s instead of 30s.

## Scope boundaries

**In scope:**
- Computation + UI per panel
- Production Days input (duration) + computed ship date display
- Manual override + revert-to-computed
- Auto-populated above-average lead drivers note in quote
- `dailyCrewHours` config value
- Batched 30-second BC writeback (refactors v1.19.693 per-row debounce) + pending-sync pill + manual "Sync now"
- `leadTimeBatchSeconds` config value

**Out of scope (future):**
- Business-day mode (Mon–Fri skipping)
- Holiday calendar
- Auto-fetch production days from a production scheduling system
- Multi-panel Gantt view
- "Expedite" suggestions (which item would move the ship date if expedited)
- Fluctuating crew size over the project timeline
- Per-panel vs per-project ship date divergence tracking
- Standard deviation / median instead of mean for driver selection

## Firestore retention compliance

- All new fields additive — no migration needed
- `controlPanelLeadDrivers` snapshot is bounded by BOM size and above-average filter — naturally small, safe
- Existing panels/quotes without these fields render with blank `productionDays` and no computed ship date
- No APP_SCHEMA_VERSION bump required

## Open questions (resolve at plan time)

1. **Per-panel vs per-project:** store `productionDays` + computed ship date on panels, projects, or both? Working assumption: **panel-level primary**, project-level rolls up to latest panel ship date + aggregated driver list.
2. **Labor categories:** include all categories (CUT + LAYOUT + WIRE + JOB BUYOFF + CRATE), or skip finishing steps? Working assumption: **include all** (`computeLaborEstimate` already sums everything).
3. **Driver note placement:** project-level quote Notes field or panel-specific? Working assumption: **project quote Notes** since that's what prints on the customer quote.
4. **Override UX:** inline field vs modal? Working assumption: **inline**, same pattern as leadTimeDays override in BOM rows.
5. **Drivers shared across panels in rollup:** if panel A has 45d item and panel B has 28d item, do both list in the project-level quote note? Working assumption: **yes, combined**, then above-average filter applied to the combined list.
