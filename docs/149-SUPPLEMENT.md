# #149 Supplement — Existing-Project Exact-BC Confidence Backfill

**Author:** Sam Wize (Coach)  
**Date:** 2026-06-17  
**Status:** Spec — awaiting Jon approval, then Marc builds  
**Depends on:** #146 core (RESOLVED, v1.20.132)

---

## Scope (Jon-locked, 2026-06-16)

| Signal | Action | Rationale |
|--------|--------|-----------|
| `bcMatchType === "exact"` | Promote `confidence` → `"high"`, delete `_confDowngradeReason` | BC catalog is authoritative ground truth — same rule #146 established at lines 14901/26379 |
| `bcMatchType` fuzzy/other | Leave as-is | Fuzzy match can mask a misread; circle must stay |
| No BC match | Leave as-is | No verification signal; may be a real misread |
| Text-layer recompute | OUT OF SCOPE | Lower impact, higher complexity — separate ticket if wanted |
| Vision-row model confidence | OUT OF SCOPE | Requires re-extraction or model-confidence reconstruction |

---

## 1. Persist-Safety Confirmation

**Verdict: SAFE.** Writing recomputed `confidence:"high"` to stored BOM rows for exact-BC-matched items has zero downstream perturbation. Full trace below.

### Every consumer of `row.confidence`, checked:

| Consumer | Location | Reads | Effect of "medium"→"high" | Safe? |
|----------|----------|-------|---------------------------|-------|
| **BOM table "C" circle** | line 28068 | `row.confidence==="low"\|\|"medium"` | Circle disappears — desired effect | YES |
| **Verification modal gather** | line 27663-27664 | Filters `lowConf` / `medConf` arrays | Row exits the review list — correct, it's BC-verified | YES |
| **Verification modal grouping** | line 28702-28704 | Splits `medConf` by `_confDowngradeReason` | Row not in `medConf` → grouping irrelevant | YES |
| **Verification badge** | line 27672 | `lowConf.length`, `medConf.length` | Count decreases — correct | YES |
| **Send-gate** | line 15632 | `panel.extractionReport?.manualVerifyRequired` | **Does not read per-row confidence.** Panel-level flag, independent system. | NOT AFFECTED |
| **Extraction report tallies** | line 12092-12095 | `verification.lowConfidenceRows[]`, `.mediumConfidenceRows[]` | These are historical extraction-time snapshots, written once at extraction. Migration does NOT touch them. No downstream code reads `extractionReport.verification` (grep confirmed zero matches). | NOT AFFECTED |
| **Next pricing run** | line 14901/26379 | `bcMap[key].bcMatchType==="exact"` | Re-applies the same promotion. Idempotent. | YES |
| **Manual PN edit** | line 25535 | Sets `confidence:"high"` | Already "high" → no-op. | YES |
| **Portal supplier quotes** | line 46820/46826 | Separate confidence namespace (supplier extraction, not BOM row) | NOT AFFECTED |

### `_confDowngradeReason` cleanup

The migration also deletes `_confDowngradeReason` on promoted rows. This field is only read within `medConf` filters (lines 28702-28704). Since the row exits `medConf` when confidence becomes "high", the reason is unreachable. Deleting it is clean — matches the pattern at lines 10658, 12089, 25535 where other promotion paths clear it.

Note: the #146 apply paths (14901/26379) set confidence to "high" but do NOT delete `_confDowngradeReason`. Minor inconsistency — the stale field has no observable effect but accumulates dead metadata. The migration fixes this for backfilled rows. Follow-up for the apply paths is low-priority cleanup (not #149 scope).

---

## 2. Hook Point Analysis

### Where: `migrateProjectShape()` (line 9219)

This is the single funnel for all project-load migrations. Called from:
- `loadProjects()` (line 9210) — dashboard load, all projects
- `migrateProject()` (line 10530) — project open + `onSnapshot` updates

Every project that enters React state passes through this function. It is:
- **Pure** — no Firestore calls, no module-level reads, no side effects
- **Idempotent** — safe to re-run on every load
- **Established** — existing migrations for ECO counters, serviceCards, quoteRev all live here

### Gate: `_confidenceRecomputedAt` project-level flag

Pattern matches the existing `_quoteRevManualResetApplied` one-time flag. Set unconditionally at end of migration block (even if no rows changed) so the scan never re-runs after the flag persists.

**Lifecycle:**
1. First load post-deploy → flag absent → migration runs in memory → flag set on in-memory copy
2. User works in project → any save (`safeSave`) writes flag to Firestore
3. Subsequent loads → flag present → migration block skipped entirely

**Dashboard load cost:** Flag check (`if(!out._confidenceRecomputedAt)`) short-circuits in O(1) for already-migrated projects. For unmigrated projects, scan is O(panels × bom_rows) — sub-millisecond even for 100+ row BOMs.

**Before-save re-load:** If `onSnapshot` fires before save (Firestore → `migrateProject` → `migrateProjectShape`), the flag isn't in Firestore yet, so migration re-runs in memory. Idempotent — same result. Flag persists on next save.

---

## 3. Implementation Spec

### Location

Inside `migrateProjectShape()`, after the quoteRev auto-normalize block (line 9306), before the `return out;` (line 9307).

### Code shape (~15 lines)

```javascript
// #149: Backfill exact-BC confidence for existing projects.
// #146 core (v1.20.132) established Rule #1: exact BC match → confidence "high".
// Projects priced before v1.20.132 carry stale medium/low confidence on
// rows that BC already verified. Recompute once, then flag.
if(!out._confidenceRecomputedAt){
  out.panels=(out.panels||[]).map(pan=>{
    if(!pan.bom||!pan.bom.length)return pan;
    let changed=false;
    const bom=pan.bom.map(r=>{
      if(r.bcMatchType==="exact"&&r.confidence!=="high"){
        changed=true;
        const nr={...r,confidence:"high"};
        delete nr._confDowngradeReason;
        return nr;
      }
      return r;
    });
    return changed?{...pan,bom}:pan;
  });
  out._confidenceRecomputedAt="v1.20.NNN"; // deploy version
}
```

### Key design points

1. **Immutable spread pattern** — new panel/row objects only when changed. Unchanged panels/rows keep original references (React reconciliation friendly).

2. **`r.confidence !== "high"` guard** — rows already at "high" (set by #146 core during a post-v1.20.132 pricing run) are untouched. Zero-cost idempotency.

3. **Flag set unconditionally** — even if zero rows changed (project was already clean, or no BC-matched rows). Prevents re-scanning on every load.

4. **`_confDowngradeReason` deleted** — matches extraction-time pattern (line 12089). Cleans stale metadata.

5. **No `extractionReport` changes** — the report is a historical extraction-time record. The live display reads BOM rows directly.

---

## 4. Coverage Analysis

### What this covers

Rows with `bcMatchType === "exact"` persisted from any pricing run since v1.20.110 (when `bcMatchType` was introduced in the F1/C5 guard work, #110). This is the majority of active projects — any project priced in the last ~23 releases.

### What this does NOT cover

**Pre-v1.20.110 projects** — priced before `bcMatchType` was stored. These rows have `priceSource:"bc"` but no `bcMatchType` field. We cannot distinguish exact from fuzzy for these rows.

**Self-healing path:** The next "Get New Pricing" click on a pre-v1.20.110 project runs the #146 apply paths (14901/26379), which set `bcMatchType` and promote confidence for exact matches. No special backfill needed — standard user workflow covers it.

**Decision: leave pre-v1.20.110 rows alone.** Attempting to infer exactness from `priceSource:"bc"` alone violates Jon's scope (fuzzy → do NOT clear). The coverage gap is small and self-heals on next pricing run.

---

## 5. Test Plan

### T1 — Exact-BC row promoted
Open a project with BOM rows that have `bcMatchType:"exact"` and `confidence:"medium"` (or "low"). On first open post-deploy: "C" circle should disappear from those rows. Verification modal count should decrease.

### T2 — Fuzzy-BC row untouched
Same project, rows with `bcMatchType` not "exact" (fuzzy, or any other value). "C" circle should remain. Confidence unchanged.

### T3 — No-BC row untouched
Rows with no `bcMatchType` field (never priced via BC, or priced pre-v1.20.110). Circle should remain. Confidence unchanged.

### T4 — Already-high row untouched
Rows with `bcMatchType:"exact"` AND `confidence:"high"` (already correct from #146 core). No change, no new object allocation.

### T5 — Flag persists after save
After T1, save the project (any edit). Reload. Migration should NOT re-run (flag present). Verify via console — no `[QUOTE REV]`-style log from the migration (or add a brief console.log in the migration block for Marc's testing, remove before ship).

### T6 — Send-gate independent
Project with `manualVerifyRequired:true`. Open post-deploy. Exact-BC circles disappear, but send-gate still blocks. Confirm independence.

### T7 — Dashboard load performance
Open dashboard with 50+ projects. Page load should not regress. Flag check short-circuits for migrated projects.

### T8 — Idempotency
Open a project (migration runs in memory). Don't save. Close and reopen. Migration re-runs (flag not in Firestore yet). Result should be identical — no double-promotion, no stale state.

---

## 6. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Wrong rows promoted | Very low — `bcMatchType==="exact"` is the strictest possible check | Medium — false "high" hides a real misread | Gate is the same check #146 core uses; proven in production |
| Performance on dashboard load | Very low — flag check is O(1), scan is O(rows) only once | Low — sub-ms even for large BOMs | Flag set unconditionally prevents re-scan |
| Save race with onSnapshot | None — migration is idempotent | None | Re-runs produce identical output |
| extractionReport drift | None — report not modified | None | Historical record preserved |

---

## 7. Scope Boundaries (DO NOT WIDEN)

- NO text-layer recompute (different signal, different risk profile)
- NO vision-row model-confidence reconstruction (requires AI re-call)
- NO pre-v1.20.110 inference from `priceSource:"bc"` (can't distinguish exact from fuzzy)
- NO extractionReport modification (historical record, not live display)
- NO APP_SCHEMA_VERSION bump (this is a data-enrichment migration, not a schema change)
- NO batch Firestore job (lazy on-load is sufficient)
