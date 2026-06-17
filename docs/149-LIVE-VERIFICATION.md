# #149 — Live Post-Deploy Verification (v1.20.134)

**By:** Marc Masdev — 2026-06-17
**Build:** v1.20.134 (commit `119c31b8`, tag `v1.20.134`)
**Verdict:** ✅ Core behavior CORRECT, no regression, no data loss. ⚠️ Coach's supplement §1–§2 persist-once / flag claims are **inaccurate in practice** — needs a doc correction (details below). No code fix required for correctness.

---

## What was confirmed working

1. **Promotion is correct & in-memory-complete.** On every load (dashboard + open), `migrateProjectShape` promotes ALL `bcMatchType==="exact"` rows below "high" to "high" across ALL panels, in memory. Display is always correct — verified live on PRJ402100 (Abbeville): OVERALL CONFIDENCE BOM **100%**, exact-BC "C" circles gone (live T1).
2. **Scope is exact-BC only (live T2/T3).** PRJ402068 (Brush Creek) shows BOM **98%** — it has flagged rows, but they are NOT exact-BC (fuzzy/vision), so the backfill correctly left them flagged. PRJ402114 (100%, nothing to promote) untouched.
3. **Idempotent live.** Migration re-ran across 3 dashboard waves (8:55:42 / 8:56:07 / 9:00:42) with **identical** counts (49/43/74/16) and no double-promotion — live T8.
4. **No version regression.** `_computeDvBomHash` hashes only `{partNumber, qty}`; `confidence` is in neither the Dv hash nor the quote hash. Promotions persist **without** bumping `bomVersion` or `quoteRev`. Verified: Abbeville/Proctors `quoteRev` held at 1 through multiple saves.
5. **Flag DOES persist on a project-level save (T5 core).** Toggling owner-lock (→ `saveProject`, full `{...project}` spread) wrote `_confidenceRecomputedAt:"v1.20.134"` to Firestore (null→stamped). Gate-skip-on-flag-present is harness-proven.
6. **Base-wide audit (first dashboard load):** 182 exact-BC rows promoted across exactly 4 projects (PRJ402119/49, PRJ402096/43, PRJ402113/74, PRJ402100/16). Log counts matched Firestore ground truth exactly.

---

## The inaccuracy in the supplement (§1 "Lifecycle", §2 "Gate")

The supplement claims: *"any save (`safeSave`) writes flag to Firestore"* and *"Subsequent loads → flag present → migration block skipped entirely."* **Both are unreliable in practice.**

### What actually happens

- **Project open fires a panel-level `saveProjectPanel`** (the Lead-Drivers refresh effect — confirmed via `[QUOTE REV] suppressed (panel save)` at 9:06:11). This persists the active panel's promoted BOM **but not the project-level `_confidenceRecomputedAt`** — and can **clobber** a flag a prior `saveProject` set. Observed live: Abbeville flag went null → `v1.20.134` (after owner-lock save) → **null again** (after a subsequent panel/background save).
- **Multi-panel projects persist promotions panel-by-panel.** PRJ402119 (Proctors, 3 panels) dropped 49→**7** after I opened it: only the active panel's ~42 rows persisted; the other panels' 7 rows stayed medium in Firestore (still promoted in-memory on display).
- **Background saves touch un-opened projects.** PRJ402096 (Salares) went 43→**0** persisted without me ever opening it — a pre-existing background/`onSnapshot` save path. (Not a #149 regression — #149 adds no save.)

### Why it doesn't matter for correctness

The migration promotes in memory on **every** load across **all** panels, so the **display is always correct** regardless of what persisted. The flag and persistence are pure optimizations. Consequences of the inaccuracy are benign:
- Migration re-runs (sub-ms no-op) on loads where the flag was clobbered or never set.
- `[CONF BACKFILL]` logs are **self-limiting but not strictly once-per-project** — they fire whenever unpersisted exact-non-high rows exist, quieting as persistence accumulates.

No data loss (promotion only adds `confidence:"high"` + deletes the display-only `_confDowngradeReason`). No quoteRev/Dv churn.

---

## Recommendations (for Jon / Coach)

- **(Doc)** Coach revise §1 Lifecycle / §2 Gate: the flag is **best-effort**, not guaranteed persist-once; panel/background saves don't carry it and can clobber it; correctness is guaranteed by in-memory re-promotion, not by the flag.
- **(Optional, minor)** If `[CONF BACKFILL]` console noise on repeat loads is undesirable, gate the log behind a session-level `Set` of project ids, or accept it as the intended audit trail.
- **(Separate TODO candidate)** The background save of un-opened projects (Salares) is pre-existing and connects to the historical load-time-save concerns. Worth a look independent of #149 — flagged, not blocking.

## Residual state from testing
Real projects touched are in their **intended** post-migration state (exact-BC rows promoted = the feature). The only artificial edit (Abbeville owner-lock toggle) was fully reverted (`ownerLockActive:false`). No cleanup needed.
