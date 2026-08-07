# F090 — BOM Version Tracking (BOMv.##) — Build-Ready Scoping Plan

**Author:** Sam Wize (Coach) · **Date:** 2026-08-06 · **Prod:** v1.24.105
**Status:** SCOPING — not built. Money-path-ADJACENT (BOM/pricing history integrity + restore→refresh).
**Absorbs:** G027 ("remove the ↩ Restore button").
**All line numbers verified against live `src/app.jsx` at v1.24.105 (re-grepped, no stale anchors).**

---

## 1. Problem / Intent (Jon's spec, restated)

Add a **BOMv.##** version pill (like the existing Dv / Rv / Qv pills) that tracks the BOM as a numbered, fully-archived history:

- Initial extraction = **BOMv.01**.
- **Bump on 6 triggers:** (a) row deleted, (b) row added, (c) part# crossed/changed, (d) qty changed, (e) price changed, (f) lead-time changed. Bumps OFTEN → **store EVERY version** (full history, no trim).
- **Remove the "↩ Restore" button** (G027). Make the **BOMv.## pill a BUTTON** → opens a **BOMv history modal**: list all versions + date + a link to VIEW that BOM + an option to **Restore**.
- **Restore flow:** confirmation modal ("current BOM is archived as the next BOMv.## before restoring"), then on restore **run F089 "🔄 Refresh Pricing + Lead Times"** to bring the restored BOM up to date.

**The single biggest realization from the code read:** ~70–80% of F090 already exists. There is already a permanent, per-panel, version-numbered history subcollection (`_dvHistory`), a pill→button→read-only-history-modal pattern (`Dv` pill → "📋 Previous Versions" → `DvHistoryModal`), and a full-BOM-state snapshot/restore mechanic (`_snapshots` / `saveSnapshot` / `restoreSnapshot`). F090 is largely a **convergence + generalization** of these two existing systems, plus adding Restore-from-history and the price/LT bump triggers.

---

## 2. Existing infra to reuse (all code-confirmed)

### 2a. The version pills — Dv / Qv / Rv (the model to imitate)
| Concept | Field | Where | Notes |
|---|---|---|---|
| **Dv** (Drawing Version) | `panel.bomVersion` (Number, per-panel) | pill render `src/app.jsx:33097-33100`; PDF/traveler box `__DV_QV__` | Bumps on **PN/qty change + redline add/remove + re-extraction**. **Explicitly does NOT bump on price-only or lead-time-only** (`DECISION(v1.19.1079)`, comment at 10671-10675). |
| **Qv** (Quote Rev) | `project.quoteRev` (+ `qvHistory[]` array on project doc) | `_logQvHistory` 11228, `_mergeQvHistory` 11236 | Project-level counter; history is an **array** on the project doc (small entries: id/by/at + reason). |
| **Rv** (Review Rev) | `project.reviewRev` / `preReviewRev` | review flow | Counter + `reviewChangeLog[]`. |

**Takeaway:** F090's BOMv should be a **per-panel Number counter** exactly like `bomVersion`, seeded to 1, but with a **subcollection** history (not an array — see §5) because each BOMv entry stores a full BOM snapshot, unlike Qv's tiny log entries.

### 2b. The bump chokepoint (SSOT — already centralized)
`_bumpBomVersionIfChanged(newPanel, existingPanel)` — `src/app.jsx:10676-10693`. Called from **exactly two save wrappers**, and nowhere else:
- `saveProject` per-panel loop — **line 10931**
- `saveProjectPanel` — **line 11403**

The change-detector is `_computeDvBomHash(panel)` — **line 10661-10667** — currently hashes only `{partNumber, qty}` of non-labor rows. **Every BOM mutation in the app funnels through these two save wrappers**, so the bump is already a true SSOT. F090 does **not** need to hunt down 6 edit sites — it adds one parallel detector at the same chokepoint (see §4).

### 2c. `_dvHistory` — the permanent version-history subcollection (the storage model to reuse)
- `archiveDvVersion(uid, projectId, panel)` — `src/app.jsx:11251-11269`. Writes to `…/projects/{id}/_dvHistory/{versionNumber}`. **Doc id = the version number** (natural key → idempotent `.set()`). Stores `{dvVersion, panelId, panelName, createdAt, reason, bom (deep-cloned), laborData, pageRefs[]}`. **pageRefs are POINTERS** to existing Storage files (`storageUrl`/`originalPdfPath`/`pageNumber`) — **no image data duplicated** (data-retention rule #4 satisfied by design). **NOT FIFO — permanent.**
- `loadDvHistory(uid, projectId)` — `src/app.jsx:11271-11275`. Loads all, `orderBy("dvVersion","desc")`.
- **Currently only called on drawing REVISION** (`handleReconciliationCommit`, line 28847) — i.e. it archives the outgoing Dv before a re-extraction reconciliation. F090 generalizes this to archive on **every BOMv bump**.

### 2d. `DvHistoryModal` — the read-only history modal (the UI to clone)
`DvHistoryModal({history, loading, onClose})` — `src/app.jsx:27564-27607`. Renders each archived version: `Dv.## — archived {date} — {reason}`, a row of page **thumbnails linked to Storage** (`<a href={storageUrl} target="_blank">` → this IS the "view PDF/web" link), and a **BOM table** (Part# / Qty / Description / Mfr / Unit $). Opened by the "📋 Previous Versions" button (`33109-33119`, gated `panel.bomVersion>1`) which lazy-loads via `loadDvHistory`. **This modal is exactly F090's history modal minus the Restore + confirmation.**

### 2e. `_snapshots` — the FIFO snapshot/restore system (the thing G027 removes + the restore mechanic to reuse)
- `saveSnapshot(uid, projectId, panel, reason)` — `src/app.jsx:11191-11205`. Writes to `…/projects/{id}/_snapshots` (auto-id). Stores `{panelId, panelName, reason, createdAt, bom, pricing, validation, laborData, status}`. **FIFO — keeps only last 10.** Called before: re-extraction (29853), Get New Pricing (31863), Refresh Pricing (32586), panel deletion (39658).
- `loadSnapshots` — 11206-11212. `restoreSnapshot(uid, projectId, snapshot, panel, onUpdate, onSaveImmediate)` — **11213-11221**. Restores `{bom, pricing, validation, laborData, status}` via `onUpdate` + `onSaveImmediate` (goes through the save guards).
- **The "↩ Restore" button** — `src/app.jsx:33714-33721` — toggles `showSnapshots`; the panel at **33822-33843** lists this-panel snapshots with per-row "Restore" (arcConfirm → `restoreSnapshot`). **This is the button F090/G027 removes.** State: `showSnapshots`, `snapshots`, `snapshotsLoading`.

**Reuse map summary:**
| F090 need | Reuse | New work |
|---|---|---|
| Per-panel version counter | Model on `panel.bomVersion` | New field `panel.bomvVersion` |
| Bump SSOT chokepoint | `_bumpBomVersionIfChanged` call sites (10931, 11403) | Parallel `_bumpBomvIfChanged` + new hash |
| Permanent version subcollection | `_dvHistory` / `archiveDvVersion` / `loadDvHistory` | New `_bomvHistory` (or generalize) storing pricing too |
| History modal (list+date+view link+BOM table) | `DvHistoryModal` (27564) | Add Restore button + confirm modal |
| Restore mechanic (bom+pricing+validation+labor+status) | `restoreSnapshot` (11213) | Archive-current-first + F089 trigger |
| Refresh after restore | `onRefreshPricingAndLeadTimes({})` (F089, 33663) | Call it post-restore |
| Remove ↩ Restore | — | Delete button 33714-33721 + panel 33822-33843 + state |

---

## 3. Version model — BOMv vs the existing `bomVersion` (Dv) — RECONCILIATION (Jon decision #1)

This is the central design fork. `panel.bomVersion` = **Dv (Drawing Version)** and is **document-facing**: it prints on travelers/quotes (`__DV_QV__` box, AS-QUOTED stamp `Dv.##` at line 28830). It deliberately **excludes price/LT** so a pricing refresh does not inflate the drawing version shown to the customer.

F090's BOMv adds **price + lead-time** triggers. If we simply widened `bomVersion`'s hash to include price/LT, **every pricing refresh would bump the customer-facing Dv** — a regression of `DECISION(v1.19.1079)` and a change to what "Dv.##" means on every printed document. **Do not do this.**

**Recommendation: BOMv is a NEW, SEPARATE per-panel counter — `panel.bomvVersion`** — parallel to (not replacing) `bomVersion`:
- `bomVersion` (Dv) stays exactly as-is → printed docs unchanged, zero money-path/document risk.
- `bomvVersion` (BOMv) is the new "full priced-BOM state" version. It is the successor concept to `_snapshots` (which already tracked bom **+ pricing + validation + labor**), now numbered, permanent, and user-visible. This matches Jon's mental model precisely: BOMv **absorbs the Restore button**, so BOMv = "the restorable full-BOM-state version," a superset of Dv that includes pricing/LT.
- Both pills can co-exist (Dv near DRAWINGS header, BOMv on the BOM toolbar). Flag the potential UI confusion to Jon.

Never rename or repurpose `bomVersion` (data-retention rule #1). New field only.

---

## 4. The 6 bump triggers + dedupe/debounce design

### 4a. Triggers collapse to ONE hash change
The 6 triggers map cleanly onto a single content hash of the non-labor BOM:
| Trigger | Detected by |
|---|---|
| row added / row deleted | row **count** + row-set changes the hash |
| part# crossed/changed | `partNumber` in hash (a cross is a PN change) |
| qty changed | `qty` in hash |
| price changed | `unitPrice` in hash |
| lead-time changed | `leadTimeDays` in hash |

So the SSOT detector is a new **`_computeBomvHash(panel)`** = `_computeDvBomHash` **plus `unitPrice` and `leadTimeDays`** per row:
```
{pn:partNumber.trim(), q:qty, p:unitPrice, lt:leadTimeDays}  // non-labor rows only
```
And a new **`_bumpBomvIfChanged(newPanel, existingPanel)`** (mirror of `_bumpBomVersionIfChanged`, 10676) called **at the same two chokepoints** (10931, 11403). Because all mutations funnel through the two save wrappers, **no separate wiring at row-add/delete/cross/qty/price/LT edit sites is required** — they already reach the chokepoint. (Verify: bulk paths — supplier-portal Apply, F089 refresh, propagate-across-panels — all end in `saveProject`/`saveProjectPanel`; ARC-AUDIT F-2b.2 once flagged a bulk path that skipped the bump, so **re-confirm every bulk write reaches a save wrapper** during build — this is a "enumeration is a floor" case.)

### 4b. Dedupe / debounce (the B078/B104 coalescing lesson)
Naïve "increment + archive on every changed save" would produce a version per keystroke/blur and a subcollection write per bump. Jon wants "bump OFTEN / store EVERY version" **but** "not on every keystroke; a burst = one version." Resolution — **coalesce the version boundary, never skip a version:**

- **Do NOT increment on every save.** On a content-changed save, set a per-panel `bomvDirty` flag (compare `_computeBomvHash` of incoming vs. last-archived hash).
- **Debounced flush** (reuse the exact `_leadTimeBcQueue` pattern — `useRef({pending, flushTimer})`, config `LABOR_RATES.leadTimeBatchSeconds`-style window ~30s, **plus `visibilitychange`/unmount flush** as at 28071/29534/11637). On flush: increment `bomvVersion` **once**, archive the **current** committed state as that version. One version per idle burst; every version archived; **no skipped numbers.**
- **Discrete deliberate actions force an immediate flush + version boundary** (don't wait for debounce): re-extraction, panel deletion, and Restore itself. These mirror where `saveSnapshot` fires today (29853/31863/32586/39658), so BOMv archive-on-flush cleanly replaces those snapshot calls.
- **Idempotent write:** archive doc id = the version number (`.set()`), so a double-flush for the same version is a harmless overwrite (same natural-key safety `archiveDvVersion` already relies on).

This satisfies all three constraints: often, every-version-stored, and burst=one-version. Flush-on-nav is the correctness lynchpin — without it a user who edits then navigates loses the trailing version.

---

## 5. Storage model — subcollection vs array (the big call) → **SUBCOLLECTION, unambiguously**

**Recommendation: a per-project (per-panel-scoped) subcollection `…/projects/{id}/_bomvHistory/{versionNumber}`, permanent, no trim.** Reuse/generalize `archiveDvVersion`/`loadDvHistory` verbatim (rename or add a sibling).

**Rationale (this is the money-path-integrity crux):**
- **B078 forbids an array.** Panels are already an **inline array on the ~1MB project document** (B078). Every project-doc write serializes all panels. A `bomvVersions[]` array on the panel — each entry a full BOM snapshot (dozens–hundreds of rows) with "bumps OFTEN → store EVERY version" — would **blow the 1MB doc within a handful of versions** and inflate every unrelated project write. This is precisely the failure class B078-5 (the deferred per-panel-subcollection epic) exists to avoid. **Non-starter.**
- **Subcollection is already proven** for exactly this shape (`_dvHistory`): independent docs, each with its own 1MB budget, zero cost to the project doc, `orderBy(version desc)` lazy-load only when the modal opens.
- **Contrast with Qv:** Qv history is an array (`qvHistory[]`) **on the project doc** — acceptable only because its entries are tiny (id/by/at/reason). BOMv entries are full BOM snapshots → must be a subcollection.
- **Retention:** permanent, **never FIFO-trimmed** (unlike `_snapshots`' keep-10). Versions are the audit trail; data-retention rule #2 forbids caps on history. Each doc is small (BOM JSON + pointer pageRefs, **no `dataUrl`** — rule #4) so unbounded growth is fine (hundreds × a few KB).
- **Read/write implications:** one subcollection write per version-flush (debounced, so low frequency); reads only on modal open. No impact on hot paths. Firestore rules must allow read/write on `_bomvHistory/**` scoped to the project owner/company (mirror the existing `_dvHistory`/`_snapshots` rule — confirm those subcollections are already covered by a wildcard and extend if not).

**Snapshot payload (union of `_dvHistory` + `_snapshots`):** `{bomvVersion, panelId, panelName, createdAt, reason, bom (deep-cloned, dataUrl already absent from bom rows), pricing, validation, laborData, status, pageRefs[] (pointers)}`. This makes each version both **viewable** (BOM table + page thumbnails) and **fully restorable** (bom+pricing+validation+labor+status — same fields `restoreSnapshot` needs).

---

## 6. The BOMv history modal (pill → button → modal)

- **Pill → button:** add a `BOMv.{panel.bomvVersion}` pill on the **BOM toolbar** (near the row where "↩ Restore" is being removed, 33714 area), styled like the Dv pill (33097) / the removed button's slot. Make it a `<button>` (gate `bomvVersion>=1`; it's always clickable once there's a BOM).
- **Modal:** clone `DvHistoryModal` (27564) → `BomvHistoryModal`. Per row: `BOMv.## — {date} — {reason}`, page thumbnails **linked to Storage** (the "view PDF/web" link — already `<a href=storageUrl target=_blank>`), BOM table (add a **Lead Time** column and keep Unit $). Add a **"↩ Restore this version"** button per row.
- **"View that BOM (PDF or web)":** recommend the **read-only web render already in the modal** (thumbnails + BOM table) as the primary "view." A true PDF-of-an-old-version would mean re-running the quote/traveler generator against archived state — heavier, defer unless Jon insists (Jon decision #3).

---

## 7. Restore flow (archive-before + F089 refresh) — data-safety critical

Sequence on "Restore BOMv.##":
1. **Confirmation modal** (reuse `arcConfirm({kind:"warning"})` as the snapshot restore does at 33835): *"The current BOM will be archived as BOMv.{N+1} before restoring BOMv.{k}. Get Pricing (Refresh Pricing + Lead Times) will then run to bring it up to date. Continue?"*
2. **Archive current first (atomic-ish):** force a BOMv flush → increment to N+1 and `archiveDvVersion`-style `.set()` the **current** state under doc `N+1` **before touching the panel**. Idempotent by version-key. If this write fails → **abort, do not restore** (current state is never lost).
3. **Apply restore:** reuse **`restoreSnapshot(uid, projectId, selectedVersion, panel, onUpdate, onSaveImmediate)`** (11213) — restores `{bom, pricing, validation, laborData, status}` through the save guards (`onUpdate` + `onSaveImmediate`). The restored `bom` carries that version's metadata flags **as they were** — correct for a restore.
4. **Run F089 refresh:** call **`onRefreshPricingAndLeadTimes({})`** (the F089 handler wired at 33663) on the restored panel to re-match BC + pull BC prices/LT + overwrite with Mouser/DigiKey + BC writeback.

**Atomicity/failure analysis:**
- Step 2 before step 3 guarantees the pre-restore state survives even if the app dies mid-restore (it's already a numbered version).
- If step 4 (F089) fails, the **restored BOM is still committed** (step 3 succeeded); F089 is additive/overwrite of prices, not destructive — user can re-run "🔄 Refresh Pricing + Lead Times" manually. Surface a non-fatal toast, don't roll back.
- The one genuinely destructive step is step 3's overwrite of the live BOM — mitigated entirely by step 2 having archived it first.

---

## 8. G027 absorption — removing the "↩ Restore" button

**Safe to remove.** Dependency check (grepped):
- Button `33714-33721` + panel `33822-33843` + state `showSnapshots`/`snapshots`/`snapshotsLoading` — **the only UI consumers** of `loadSnapshots` (11206) and the only caller of `restoreSnapshot` via the UI (33836).
- `restoreSnapshot` (11213) — **keep the function**; F090's restore reuses it (§7.3).
- `saveSnapshot` calls at 29853 / 31863 / 32586 / 39658 — become **redundant** with BOMv archive-on-flush (§4b forces a version boundary at exactly those discrete events). **Jon decision #5:** delete these `saveSnapshot` calls (and the FIFO `_snapshots` collection) outright, or leave them dormant as a belt-and-suspenders safety net during the BOMv rollout. Recommend: leave `saveSnapshot` calls for one release as a safety net, remove only the **button** now (that is literally what G027 asks), then retire `_snapshots` in a follow-up once BOMv is verified.
- Nothing else references the button. Clean removal.

---

## 9. Data-retention + money-path risks

1. **Doc-size blowout (B078)** — mitigated by subcollection (§5). The single most important decision; getting it wrong regresses the whole 1MB-doc discipline.
2. **Never lose a version** — permanent, no trim (§5); flush-on-nav/unmount so trailing edits aren't lost (§4b); archive-before-restore (§7.2).
3. **No `dataUrl` in archives** (rule #4) — `bom` rows and `pageRefs` carry no image data by construction (pageRefs are Storage pointers); verify the deep-clone doesn't pull a transient `dataUrl`.
4. **Restore + F089 overwrites manual/budgetary prices** (Jon decision #4) — F089 makes BC the source of truth and **overwrites manual/budgetary rows** (its own confirm says so). Restoring an old version then auto-refreshing means the restored manual prices get overwritten by fresh BC/API. Jon's spec explicitly wants "bring it up to date," so this is likely intended — **confirm**, and word the restore confirm modal so the user isn't surprised.
5. **Preserve `bomVersion` (Dv)** — BOMv is a new field; never touch `bomVersion`, its bump logic, or the printed `__DV_QV__` box (rule #1, and avoids document/money-path risk).
6. **Bulk-path bump coverage (F-2b.2 / "enumeration is a floor")** — re-grep every bulk BOM write (supplier Apply, F089 refresh, propagate-across-panels, portal import) to confirm each reaches `saveProject`/`saveProjectPanel` so BOMv actually bumps. One missed bulk path = a silent gap in the "store EVERY version" guarantee.
7. **Version-number monotonicity under concurrency** — two rapid flushes must not both claim the same number. The debounced single-flusher per panel + version-keyed `.set()` handles the common case; if multi-user/multi-tab is a concern, read-max-then-increment inside the flush (cheap, low frequency).

---

## 10. Open Jon decisions (before build)

1. **BOMv separate from Dv, or replace Dv?** — Recommend **separate new counter `bomvVersion`** (keeps Dv document-facing + risk-free). *Biggest call — everything downstream depends on it.*
2. **Debounce window + flush triggers** — Recommend ~30s idle (reuse `leadTimeBatchSeconds`-style config) + visibilitychange/unmount flush + immediate flush on re-extract/delete/restore. Confirm "burst = one version" is acceptable (vs. literally one-per-save).
3. **"View that BOM" = web render or generated PDF?** — Recommend web render (already in the modal). PDF-of-old-version is a heavier follow-up.
4. **Restore→F089 overwrites manual/budgetary prices** — confirm intended, and confirm the confirm-modal wording.
5. **Retire `_snapshots` now or later?** — Recommend remove the **button** now (G027), keep `saveSnapshot` as a dormant safety net for one release, retire the collection in a follow-up.
6. **Legacy backfill** — Existing panels have no BOMv history. Seed `bomvVersion:1` = current state on first post-deploy save (mirror the #139 `bomVersion` seed at 10680), archiving the current BOM as BOMv.01. Confirm.
7. **Show Lead Time column in the history modal BOM table?** — Recommend yes (BOMv tracks LT).

---

## 11. Effort + gate

**Effort: L (Medium-Large).** High reuse (subcollection infra, modal, bump chokepoint, restore mechanic, F089 handler) but non-trivial new mechanics:
- New counter field + `_computeBomvHash` + `_bumpBomvIfChanged` at 2 chokepoints — **S**.
- Debounced archive-and-flush coalescer with nav/unmount flush + discrete-action force-flush — **M** (the trickiest correctness area).
- `BomvHistoryModal` (clone + Restore + confirm) + pill button — **M**.
- Restore→archive-first→F089 orchestration — **S–M** (data-safety sensitive).
- G027 removal + Firestore rules for `_bomvHistory` — **S**.
- Bulk-path bump-coverage audit — **S**.

**Gate (per H-item discipline + money-path-adjacent):**
- **H-item plan** (this doc → Marc's `H{N}-PLAN.md`), **Coach review**, **Jon approval** before build (decisions §10, esp. #1).
- **Coach review of the restore+F089 data-flow** and the debounce/flush correctness before deploy.
- **Live verification gate on Test** before prod: create BOMv.01 on extraction → make each of the 6 edit types → confirm one version per burst → open modal → view → restore an old version → confirm current archived as N+1 → confirm F089 runs → confirm no data loss and Dv/printed docs unaffected. Backward-compat: load a legacy project, confirm BOMv.01 seeds and nothing regresses.
