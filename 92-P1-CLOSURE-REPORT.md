# #92 Phase 1 Closure Report — Cache Re-Key

**Implementer:** Marc Masdev · 2026-06-03
**Version:** v1.20.93 (commit a6906355)
**Plan:** 92-PHASE1-DETAILED-PLAN.md (Coach, approved by Jon)

---

## What Changed

Re-keyed two module-scoped caches from bare `panelId` to `projectId:panelId` composite keys:

- **H1 — `_pendingPagesCache`**: 3 accessor functions gained a `projectId` parameter. 5 write sites + 1 read site updated.
- **H2 — `_bgTasks`**: Added `_bgKey(projectId, panelId)` helper. ~50 bg* call sites converted. 1 direct `_bgTasks[]` access (deletePanel) converted. `syncTaskId` construction updated.
- **`bgTaskIsForThisProject` guard**: KEPT as defense-in-depth (5 usage sites, not 2-3 — instruction said "any ambiguity → leave it").

Single atomic commit. No other refactoring.

---

## Pre-Flight Verification

All 7 grep checks confirmed the plan's enumeration was complete:

| Check | Result |
|-------|--------|
| a) bg* callers | All accounted for, including bgHeartbeat (3 sites) and bgDismiss (1 site) |
| b) _bgTasks[] direct access | W-D1 (deletePanel) + internal helpers only |
| c) pendingPages accessors | Exactly 6 sites (W1-W5 + R1) — matches plan |
| d) notify/listeners | R1 is the only key-based consumer |
| e) ProjectBoard R3 | Object.values only, no key lookup |
| f) activeExtractions | rbg* functions receive taskId from callers, never reconstruct |
| g) Separator safety | Panel IDs: `panel-N` / `panel-{timestamp}`. Project IDs: alphanumeric. No colons possible. |

No surprises. No unenumerated sites.

---

## Pre-Fix Repro (v1.20.92)

**Method:** Injected fake pending pages into `_pendingPagesCache` for `panel-1` while viewing PRJ402081 (Project A). Navigated to PRJ402078 (Project B).

**Result:** Project B's PanelCard showed "1 DRAWING in package — REPRO-ProjectA-page1.pdf" with a "Proceed with Extraction" button. **Contamination confirmed** — PRJ402078 was displaying PRJ402081's pending pages because both share `panel-1` and the cache was keyed by bare `panelId`.

---

## Post-Fix Validation (v1.20.93)

### H1 — Pending Pages Cache

**API test:**
- `pendingPagesSet("PRJ402081", "panel-1", data)` → stored under key `PRJ402081:panel-1`
- `pendingPagesGet("PRJ402081", "panel-1")` → FOUND (correct)
- `pendingPagesGet("PRJ402078", "panel-1")` → NOT FOUND (correct — fix works)

**UI test:**
Same repro steps. PRJ402078's PanelCard shows a clean empty "Drop or click" zone — no contamination. PRJ402081's data remained accessible under its composite key.

### H2 — Background Tasks

**Function signature verified:**
- `_bgKey("PRJ402081", "panel-1")` → `"PRJ402081:panel-1"`
- All bg* callers pass composite key
- `bgTaskIsForThisProject` guard retained as secondary defense

---

## Advisory Review Notes (from deploy.sh)

1. **"Potential missed call sites"** — verified: post-edit grep found zero bare `panel.id` or `panelId` in any bg* call.
2. **"`_extractionProjectId` vs `projectId`"** — verified: line 23379 shows `const _extractionProjectId=projectId;` — same closure, same value. No divergence possible.

---

## #87 Impact

Per the plan: this re-key **closes the H1 contamination vector independently of #87**. Even if two projects both have `panel-1`, their cache keys differ (`projA:panel-1` vs `projB:panel-1`). #87 (panel ID uniqueness) can downgrade from MEDIUM to LOW — it remains a defense-in-depth improvement, no longer a data-integrity risk.
