# Milestone C Planning Supplement

**Author:** Coach (Senior Development Engineer, Architecture)
**Date:** 2026-05-28
**Scope:** Consistency audit + design specifics for Milestone C (Restore Preview + Drift Detection)
**Prerequisite:** Plan v3 verified, Milestones A (v1.20.24) and B (v1.20.26) deployed.

---

## 1. Plan Consistency Audit — Milestone C Surface

Reviewed all Milestone C-relevant plan sections against refinements landed in sessions since plan v3 verification. Four gaps found; remaining surfaces are consistent.

### GAP 1: RESOLVED — Labor rate drift comparison (Plan line 91)

**Original gap:** Plan says `buildRestorePreview` compares `archive.panels[].pricing.laborRate` against `LABOR_RATES.shopRate`, but no `shopRate` key exists in `LABOR_RATES` or anywhere in the codebase. The hourly labor rate is per-panel at `panel.pricing.laborRate` (default 45, line 1073).

**Resolution (Jon, 2026-05-28): Option D — per-panel editable rate in preview, no new config infrastructure.**

The restore preview displays each panel's archived labor rate as an editable field. No company-level `shopRate` is introduced. The user reviews and optionally adjusts each panel's rate before confirming restore. This avoids adding config infrastructure (`LABOR_RATES.shopRate`, Settings UI, Firestore field) that would only serve one feature.

**RestorePreviewModal labor rate section behavior:**
- Each panel listed with its archived `pricing.laborRate` in an editable number input
- Default value = archived rate (what the project had when archived)
- User can adjust any panel's rate before confirming (e.g., update from $45 to $52)
- On restore/copy: `executeRestore` applies whatever values are in the inputs to `panel.pricing.laborRate`
- No "drift" comparison against a system rate — the user IS the comparison, reviewing archived rates against their current knowledge of correct rates

**Plan line 91 update needed:** Remove `LABOR_RATES.shopRate` reference. Replace with: "Labor rate section shows per-panel archived rates as editable fields; user adjusts before confirming."

**Plan wireframe update (line 635):** Replace `"Archived: $45/hr → Current: $52/hr"` / `"☐ Update to current rates"` checkbox with per-panel editable rate inputs.

**No decision needed — resolved.**

### GAP 2: RESOLVED — Archive browser access pattern clarified by Jon

**Original gap:** Plan gated both browser entry points (gear menu, Settings link) at admin-only, but the permission model allows restore at canWrite() (edit + admin). Edit users had no path to the browser.

**Resolution (Jon, 2026-05-28):** Two entry points to the same `ArchiveBrowserModal`, with split gating:

| Entry point | Location | Visible to | Notes |
|-------------|----------|------------|-------|
| Gear menu: "📦 Archived Projects" | Gear menu (~line 42538) | All writers (`canWrite()`) | Matches restore permission model |
| Settings: "Show Archived Projects" button | Settings modal, admin archive section | All writers (`canWrite()`) | New button alongside existing "Archive All Projects" |
| Settings: "Archive All Projects" button | Settings modal, admin archive section | Admin only (`isAdmin()`) | Unchanged from current plan |

**Implementation note:** Both entry points open the same `ArchiveBrowserModal` component — the Settings button is ~5 lines of wiring to the same modal state. Row-level actions inside the browser retain their existing permission gates (Restore/Copy = canWrite(), Delete = isAdminMember()).

**No decision needed — resolved.**

### GAP 3: `restoreSkipped` BOM visual treatment unspecified

**What the plan says:** Q2 (lines 872-875) defines the `restoreSkipped: true` flag on BOM rows. The smoke test (line 836) says rows are "visually flagged in restored project BOM so user can review." The RestorePreviewModal wireframe (line 621) shows a `[Skip]` button for missing items.

**What's missing:** No spec for how `restoreSkipped` rows render in the BOM table after restore. What color/icon/tooltip? Can the user clear the flag? Is there a filter to show only skipped rows?

**Recommendation:** Minimal spec needed — a single row-level visual indicator (e.g., amber background + "Skipped during restore — review and remap or mark customer-supplied" tooltip). No filter or bulk action in Milestone C — that's Milestone D territory if needed.

**ARC Dev can propose the visual treatment during implementation. Not a blocking gap.**

### GAP 4: Plan line references drifted from implementation

The plan's line references for existing code (e.g., `bcLookupItem(partNumber)` at "line 4045", ProjectTile at "line 39812") shifted during Milestone A/B implementation. These are documentation-only — not blocking, but ARC Dev should treat plan line numbers as approximate and grep for function names instead.

**No action needed. Informational.**

### Surfaces that ARE consistent

| Surface | Refinement | Plan location | Status |
|---------|-----------|---------------|--------|
| Permission model (Restore = canWrite) | Changed from admin-only | Lines 182, 599 | Consistent (except GAP 2 entry points) |
| R2 hard-block restore lock | Three-case check, no soft-signal | Lines 114-117, 708-729 | Consistent — "HARD BLOCK" language, no proceed button |
| Q5 wording ("users without a company workspace") | Changed from "transient init state" | Lines 358, 766, 896 | All three updated in Milestone B |
| `_archiveComplete` integrity check | Step 2 of executeRestore | Line 112 | Consistent |
| BC precondition (Restore vs Copy) | Restore requires _bcToken, Copy doesn't | Lines 648-649, 181-182 | Consistent |
| ECO handling (flatten vs keep) | Copy to New Quote variant | Lines 653-659, 178-181 | Consistent |
| `COST_DRIFT_THRESHOLD = 0.05` | Named constant | Line 95 | Consistent |
| Archive browser access pattern | Two entry points, writer-visible | GAP 2 resolved by Jon | Consistent — gear menu + Settings button, both canWrite() |

---

## 2. Drift Detection Design Specifics

### 2.1 Query Batching Strategy

The plan's `buildRestorePreview` (line 84) specifies per-item `bcLookupItem()` calls. For a project with 100 unique parts, that's 100 sequential BC API calls. Existing codebase patterns show a better approach.

**Recommended pattern — reuse `bcFetchItemCardCosts` (lines 4899-4921):**

- Batches 30 item numbers per request using OData `$filter=No eq 'PN1' or No eq 'PN2' or ... or No eq 'PN30'`
- Returns `Map<partNumber, {unitCost, description}>`
- 100 unique parts = 4 BC API calls (vs. 100 individual calls)

**Query plan for `buildRestorePreview`:**

| Reference type | BC function | Calls | Strategy |
|----------------|------------|-------|----------|
| Items (cost + existence) | `bcFetchItemCardCosts` pattern | ceil(uniqueParts/30) | 30-item OR filter batches |
| Items (purchase price) | `bcFetchPurchasePrices` pattern (lines 4863-4893) | ceil(uniqueParts/30) | Same batching, returns vendor-specific `Direct_Unit_Cost` |
| Customer | `bcLookupCustomer` (new helper, required) | 1 | Direct filter `$filter=number eq '...'&$top=1`. Must not use bulk load — 500-record ceiling causes false missing-customer blocks (see §2.4) |
| Vendors | Direct filter per vendor | 3-8 | `$filter=number eq '...'&$top=1` per archived `bcVendorNo`. Avoids bulk-load ceiling |
| Labor rates | Local only | 0 | No BC call — display archived per-panel `pricing.laborRate` as editable fields (GAP 1 resolved) |

**Total BC calls for typical project (80 unique parts, 1 customer, 6 vendors):** ~13 calls (3 item batches × 2 for cost + purchase price, 1 customer direct filter, 6 vendor direct filters). At 300ms inter-request pacing: ~3.9 seconds. Customer + vendor calls run in the "fast" progressive tier (§2.2) so the user sees those results within ~2 seconds while item batches continue loading.

**Rate limiting:** Apply the same 300ms inter-request delay used by `bcSyncPanelPlanningLines` (line 3501). Exponential backoff on 429 responses (1s, 2s, 4s — line 3469 pattern).

**Price comparison target (locked in):** Drift detection compares `bcFetchItemCardCosts` result (`Unit_Cost`) against the archived row's `bcItemCardCost`. This is apples-to-apples — both are BC ItemCard cost values. `unitPrice` is the user-facing sell-side price (includes markup, manual edits) and drift there doesn't indicate a BC-side change. Fallback: if `bcItemCardCost` is null on an archived row (legacy archives predating that field), fall back to `unitPrice` comparison and flag the row as "legacy — cost comparison approximate."

### 2.2 Progressive vs Blocking Preview Load

**Recommendation: Progressive (section-by-section).**

The RestorePreviewModal wireframe (lines 607-645) has four distinct sections: Customer, Items, Vendors, Labor Rates. Load them independently:

1. **Immediate (0ms):** Render modal shell. Show archive metadata (name, date, panel count). Show labor rate comparison (local-only, no BC call). If `!_bcToken`, show "BC Connection Required" and stop.
2. **Fast (single call each):** Customer lookup, vendor map. Populate Customer and Vendors sections as each resolves.
3. **Slow (batched):** Item lookups. Show "Checking N items..." with a progress counter. Populate Items section when all batches complete.

**UX detail:** The Restore/Copy button stays disabled until all sections have loaded (or errored). A mid-load API failure in one section doesn't block others — show red error state for that section with "Retry" option.

**Why progressive over blocking:** A 4-second blank modal with a spinner feels broken. First section results appear within ~500ms (single customer call), vendor section progressively populates over ~2 seconds (6 sequential calls at 300ms pacing), items section completes around ~4 seconds (batched). The user reviews customer and vendor results while items are still loading.

**Modal-close abort pattern:** When the user closes RestorePreviewModal while BC requests are in flight, results must be discarded. Use an `AbortController` created when the modal opens:
- Pass `{signal: abortController.signal}` to all `fetch()` calls inside `buildRestorePreview` (and through any helper wrappers like `bcFetchItemCardCosts`, `bcLookupCustomer`).
- On modal unmount (or close button click): call `abortController.abort()`. In-flight fetches throw `AbortError`, which the progressive loader catches and ignores (no error state, no cache write).
- AbortController is preferred over discard-on-unmount because it actually cancels the network request, freeing BC rate-limit headroom. A discard pattern would let all requests complete and waste BC API budget.
- ARC Dev: the existing `bcFetchItemCardCosts` and `bcFetchPurchasePrices` don't currently accept an `options` parameter with `signal`. Add `{signal}` as an optional last argument to both functions. The signal threads through to the underlying `fetch()` call.

### 2.2a Restore Lock Check Timing

The R2 hard-block restore lock (plan §7.7) needs to be checked at a specific point in the preview flow. Two touch points:

**At archive browser row click (before opening preview):**
- Read `restoreLock` from the archive document.
- If locked by another user and non-stale (< 5 min): show hard-block dialog immediately ("This archive is being restored by [User Name]"). Do NOT open RestorePreviewModal. No BC calls made, no lock acquired.
- If no lock, stale lock, or same-user lock: open RestorePreviewModal, begin progressive preview load.

**At Restore/Copy confirm click (after preview review):**
- ACQUIRE the lock here: write `restoreLock: {lockedBy: uid, lockedByName: userName, lockedAt: Date.now()}` to the archive doc.
- Re-check for race condition: if the write fails because another user acquired the lock between preview-open and confirm-click, show hard-block dialog and abort.
- This avoids holding the lock during multi-minute preview review sessions, which would stale-lock other users unnecessarily.

**Summary:** Check early (browser click), acquire late (confirm click). Early check is advisory — catches the common case. Late acquire is authoritative — prevents the race condition.

### 2.3 Drift Cache Strategy and TTL

**Cache level:** In-memory, keyed by `archiveId`.

**TTL:** 5 minutes. Matches the `restoreLock` stale threshold and is short enough to catch same-session BC changes.

**Invalidation:**
- On BC disconnect/reconnect (new `_bcToken`): clear all cached previews.
- On archive list refresh (`loadArchives()`): don't invalidate — archive data doesn't change; only BC-side data does.
- On modal close and reopen (same archive): serve from cache if within TTL.
- **On successful restore/copy completion:** Delete the cache entry for the restored `archiveId`. The archive's `restoreHistory` has changed, and if the user reopens the preview (e.g., to restore again as a second copy), BC state may have changed due to the restore itself (new BC project created, planning lines synced). Stale cache here would show pre-restore drift data.

**No Firestore persistence.** Drift data is point-in-time and stales within minutes. Writing it to Firestore creates data-retention liability for no benefit.

**Partial cache support:** The cache must support per-section entries, not all-or-nothing. If the Items section loaded successfully but the Customer section errored and the user clicks Retry on Customer, only the Customer section refetches — the cached Items result is preserved. This means the cache shape stores results per section:

**Cache shape:**
```js
_restorePreviewCache = Map<archiveId, {
  sections: {
    items: { result, fetchedAt } | null,
    customer: { result, fetchedAt } | null,
    vendors: { result, fetchedAt } | null,
  },
  fetchedAt: Date.now(),       // overall cache entry timestamp for TTL
  bcTokenHash: hash(_bcToken)  // invalidate if token changed
}>
```

### 2.4 Missing-Item / Customer / Vendor API-Level Handling

**Missing item:** `bcFetchItemCardCosts` returns a Map. Items not in BC simply won't be in the result Map. Check: `if (!itemMap.has(partNumber))` → status `"missing"`, red flag. No API error — just absence.

**Edge case — item exists but `Unit_Cost` is 0 or null:** Status `"found"` with a separate `"zero_cost"` flag. This is not the same as missing — the item exists but may not be costed. Yellow flag with note "Item exists but has no cost in BC."

**Missing customer (REQUIRED — direct filter query):** Do NOT use `bcLoadAllCustomers()` for drift detection. It returns up to 500 records (`$top=500`), and a company with >500 customers would produce a false "missing customer" result. A false-missing customer **hard-blocks restore** (per the plan's blocking rule at line 651: "If the customer is missing and not remapped, the Restore/Copy button is disabled"). This is a correctness requirement, not an optimization.

**Required implementation:** Use a direct filter query: `$filter=number eq '${customerNumber}'&$top=1`. One BC call, definitive answer, no ceiling. ARC Dev must implement this as a new `bcLookupCustomer(customerNumber)` helper (or inline in `buildRestorePreview`). The helper should accept an `{signal}` option for AbortController support (see §2.2 abort pattern). If the customer exists, return `{name, number}`. If not found (empty result set), return `null` → red flag.

**Missing vendor:** Use direct filter queries per vendor: `$filter=number eq '${vendorNo}'&$top=1`. The archive typically references 3-8 vendors, so this is 3-8 BC calls — acceptable and avoids the same ceiling risk as `bcGetVendorMap()`.

**Vendor drift detection scope:** Compare two fields between archived and current BC records:
- **Existence:** Does the vendor number still resolve? If not → red flag ("Vendor deleted from BC").
- **Name drift:** Compare archived `bcVendorName` against current BC vendor `Name` field. If different → yellow flag ("Vendor renamed: [old] → [new]"). Name changes may affect quotes, PO documents, and customer-facing references.
- **Other fields (contact, address, payment terms):** Not compared. These are operational details that don't affect the restore's data integrity or the user's ability to complete the restore. Expanding the comparison scope adds complexity for no restore-blocking value.

**BC down during preview:** If any BC call fails with a network error (not a 404/empty result), show red error state for that section: "Could not check [items/customer/vendors] — Business Central unavailable. [Retry]". Don't block the other sections. The Restore button stays disabled if any section is in error state — incomplete drift data means the user can't make an informed decision.

**Per-section retry behavior:** Clicking "Retry" on an errored section refetches only that section's BC calls. The cache layer supports partial entries (see §2.3 cache shape) — a successful Items cache entry is preserved while Customer retries. The retry uses the same `AbortController` lifecycle as the initial load (new controller created per retry attempt, cancelled on modal close).

### 2.5 Labor Rate Handling in Preview

**Resolved per GAP 1 (Option D):** No system-level drift comparison. The preview displays per-panel labor rates as user-editable fields.

**Preview UI spec:**

```
── Labor Rates (per panel) ────────────────────
Panel 1 — Main Control Panel    $[45.00] /hr
Panel 2 — Remote I/O Panel      $[45.00] /hr
Panel 3 — HMI Enclosure         $[52.00] /hr
```

- Each input defaults to the archived `panel.pricing.laborRate`
- Editable — user can adjust any panel's rate before confirming
- No red/yellow/green flags — this is a review-and-adjust UX, not a drift-detection UX
- On confirm: `executeRestore` writes whatever values are in the inputs to `panel.pricing.laborRate` on the restored project
- Zero BC calls required for this section

**Why this approach:** Labor rates are a business decision, not a BC-derived data point. There's no authoritative "current rate" in the system to compare against — the rate is per-panel, per-project, set by the user. Showing the archived rate and letting the user adjust is the correct UX for this data type.

---

## 3. Scope Checker — Hard Gate for Milestone C Deploy

### Status

`tools/check-scope.js` is operational and validated as of v1.20.27. It performs static AST scope analysis on `src/app.jsx` using `@babel/traverse` (zero new dependencies — `@babel/core` and `@babel/parser` already in devDependencies).

### What it catches

Runtime `ReferenceError` from identifiers not in scope — the exact bug class that caused the v1.20.23 production regression (`onArchive is not defined` in PanelListView) and the v1.20.26 regression (`db is not defined` in deleteProjectStorageBlobs). Specifically: JSX expressions and function calls that reference variables/functions with no binding in the enclosing scope chain.

### GLOBAL_ALLOWLIST — audited v1.20.27

33 project-specific entries, each with declaration-site comment (file + line number). Coach verified every entry against actual declaration locations. One phantom removed (`_arcCaptureDebug` — never declared anywhere in the repo). The `db` entry that masked the v1.20.26 bug has been removed; comment at line 90-91 documents why.

### KNOWN_VIOLATIONS Baseline — confirmed real v1.20.27

8 pre-existing violations baselined as `KNOWN_VIOLATIONS` (inline Set in the script, keyed by `"identifier:enclosingFunction"` — survives line-number shifts). All 8 confirmed as real bugs by ARC Dev, 3 spot-checked by Coach against live code. Tracked as TODO #60 with priority-ordered fix plan. Fixing them is deferred to after Milestone C.

### Invocation

```
node tools/check-scope.js          # exits 0 if no NEW violations (baseline warns only)
node tools/check-scope.js --strict  # exits 1 even for baseline violations
```

### Deploy pipeline integration — DONE (v1.20.27)

Integrated into `deploy.sh` at lines 58-71. Pipeline order:

```
bump version → scope checker → JSX build → git commit/tag/push → firebase deploy
```

The scope checker runs BEFORE the JSX build — no point compiling or deploying if scope violations exist. Uses `if ! node tools/check-scope.js; then exit 1; fi` pattern which is correct under `set -e` (conditionals are exempt from set-e abort, so the non-zero exit is caught and a clear error message is printed before halting). Both `deploy.sh` and `tools/check-scope.js` are git-tracked (staged on every deploy at line 83).

This is now a **hard gate** for all future deploys, including Milestone C.

---

## 4. Milestone C Readiness Checklist

All items must be true before ARC Dev starts Milestone C implementation.

| # | Gate | Status | Owner |
|---|------|--------|-------|
| 1 | Milestone A verified in production | **Done** (v1.20.24) | Jon |
| 2 | Milestone B verified in production | **Done** (v1.20.27) | Jon |
| 3 | Scope checker: `GLOBAL_ALLOWLIST` audit | **Done** — 33 entries verified, 1 phantom removed (Coach verified) | ARC Dev + Coach |
| 4 | Scope checker: `KNOWN_VIOLATIONS` baseline review | **Done** — 8 bugs confirmed real, 3 spot-checked by Coach | ARC Dev + Coach |
| 5 | Scope checker integrated into `deploy.sh` | **Done** (v1.20.27, lines 58-71) | ARC Dev |
| 6 | GAP 1 resolved: labor rate handling | **Done** — Option D: per-panel editable rate in preview (Jon decided 2026-05-28) | Jon |
| 7 | GAP 2 resolved: archive browser access pattern | **Done** — two writer-visible entry points (Jon decided 2026-05-28) | Jon |
| 8 | This supplement reviewed by Analyst for architectural risk | **Not done** — next step in output flow | Analyst |
| 9 | Open questions from Analyst review resolved | **Pending #8** | Jon |

### Items that do NOT gate Milestone C start

- GAP 3 (restoreSkipped visual treatment): ARC Dev can propose during implementation. Non-blocking.
- GAP 4 (line number drift): Informational. ARC Dev greps by name.
- KNOWN_VIOLATIONS cleanup: Tracked separately, not on the Milestone C critical path.
- Dual price comparison: Locked in as `bcItemCardCost` (§2.1). No longer an open question.

---

*End of supplement. Route to Analyst for architectural-risk review per output flow.*
