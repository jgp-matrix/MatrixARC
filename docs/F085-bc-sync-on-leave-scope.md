# F085 scope + BC-sync-on-leave silent-drop audit

Coach (Sam Wize) read-only analysis, 2026-08-03. Origin: Jon — "if a user leaves a project with unsynced ARC→BC changes, does it sync automatically or get silently dropped? Prompt to sync-now vs. wait." Line numbers = current `src/app.jsx`. Scope-only; money-path (BC) → Coach review + Test + Jon deploy gate.

## Plain answer
**The core money-path is NOT lost; the on-screen reminder is, plus two narrow real drops.** BOM part#/qty/unit-price → BC planning-lines is protected by a **durable per-panel hash** (`bomSyncHash`, persisted on the panel). Leaving with unsynced pricing loses the ephemeral "⚠ Push Update to BC" indicator, but the sync itself **auto-recovers on next project open** (on-open auto-sync detects the hash mismatch and pushes) and the pre-print checklist also catches it. So F085 = **add a leave-time prompt + a surviving reminder**, not "stop losing data" — except for two genuine edge drops below.

## Verdict table — every ARC→BC pending path
| Path | file:line | in-app leave/unmount | hard tab-close | recovers on next open? | verdict |
|---|---|---|---|---|---|
| **Lead-time queue** `_leadTimeBcQueue` | 27470/30154/30179 | ✅ timer survives unmount (fires ~30s) | ⚠ best-effort visibilitychange only | value ✅ in Firestore; BC writeback ❌ not hash-re-derived | SAFE in-app; NARROW drop on hard close <30s |
| **Planning-lines** `bcSyncStatus`/"Push Update to BC" | 27246/30578/28845/28875 | reminder ❌ lost; sync ✅ recovers | reminder lost; sync recovers | ✅ via durable `bomSyncHash` | SAFE (data) / reminder ephemeral |
| **On-open auto-sync** (recovery) | 42528–42623 | — | — | reads `bomSyncHash` mismatch | SAFE — why planning-lines isn't a drop |
| **BC offline queue** `_arc_bc_queue` | 7753/7765/7796 | ✅ durable (localStorage) | ✅ | ✅ retries on reconnect | SAFE — reference path |
| **Contingency/Buyoff/Crate auto-sync** | 30737–30754 | covered by count→hash | ❌ if in-flight | ✅ via hash | SAFE |
| **Sell-price / markup PATCH** (line 10000) | 28884–28902 | ❌ dropped if leave <2s | ❌ | ❌ hash excludes sell price (10417) | **SILENT-DROP (MED) → B082** |
| **beforeunload handlers** | 1042/41664/42168/54146 | — | guard bg-pricing/presence only — no BC flush | — | no BC flush on hard close today |

## Genuine silent-drops found (logged)
- **B082 (MED)** — sell-price/markup-only edit, user leaves <2s: the 2s PATCH timer is cleared on unmount and `computePanelBomHash` (10417) excludes sell price/markup → on-open sync never re-pushes. Narrow window, **no recovery path**.
- **B083 (LOW)** — lead-time BC writeback on hard tab-close within the 30s batch: value safe in Firestore, timer survives in-app nav; only hard-close loses the BC writeback, manually recoverable via "📤 Push Lead Times to BC."
- **Context (pre-existing, not new):** `computePanelBomHash` covers only pn/qty/unitPrice → description-only + lineQty edits never trigger any BC sync (U3 in `docs/BC-INTEGRITY-AUDIT-2026-07-27.md`). Bounds what one hash predicate can catch.

## F085 design
- **Leave hook exists:** `checkQuoteRevWarn(action)` (54133) already wraps every project-leave (logo 54291, BACK 54534, tab switch, open-another 54160). Add `checkUnsyncedBcWarn` mirroring it (or compose one gate so the two warnings don't stack two modals).
- **ONE predicate (dual-consumer rule):** `_hasUnsyncedBcChanges(project)` = `project.bcProjectNumber && panels.some(p => computePanelBomHash(p) !== (p.bomSyncHash||"") && p.bom.some(r=>!r.isLaborRow))`. Durable, App-level-readable. Refactor the inline copies at 43160 (pre-print) + 42558 (on-open) to call it so "what counts as unsynced" can't drift.
- **Modal:** "Sync now" → `syncPlanningLinesToBC()` per mismatched panel + `_flushLeadTimeBcQueue()`, then `action()`. "Later" → proceed (safe — recovers on next open + pre-print).
- **Gotchas:** owner-lock/`readOnly`/BC-disconnected/`_bcEnvMismatched` → offer "Later" only (don't offer a Sync-now that silently fails). B078 lesson: if Sync-now `result.failed.length>0`, surface via `syncFailedAlert` (28974) — do NOT stamp `bomSyncHash` or proceed as synced. Optional: add `_hasUnsyncedBcChanges` to the 54146 beforeunload guard (native "unsynced changes" nudge — can't flush async on unload).
- **Files:** `src/app.jsx` only — helper near 10416; `checkUnsyncedBcWarn`+modal near 54133; refactor 43160/42558. Additive, no new persisted field (reuses `bomSyncHash`).
- **Effort S–M · Risk LOW–MED.**

## Jon decisions
1. **Predicate scope:** hash-based now (catches pn/qty/price — main path, ships Small) vs. widen hash to also catch sell-price/markup + description/lineQty (fixes B082 + U3 gap, but touches the sensitive shared `computePanelBomHash` → coordinate with B067). *Coach rec: ship hash-based leave-prompt first; hash-widening separate.*
2. **Log the two drops?** *Rec: yes — B082 (MED), B083 (LOW).* (Logged.)
3. **beforeunload nudge** (native "unsynced BC changes" on hard tab-close) — yes/no?
