# Session State — 2026-06-29 MDT (post-#168 re-investigation close-out)

## Version
**v1.21.2** (deployed 2026-06-29, PRODUCTION). Patch bump over v1.21.1.
Shipped: **#168-adjacent race removal** (delete Path A duplicate auto-sync trigger). Code-only change
to `src/app.jsx` (delete + 2 guard comments). **This is NOT the #168 fix** — see #168 status below.

## Deploy State
- **Master tip:** `e7cfbc81` ("Release v1.21.2"). #168 race-removal code commit: **`9c885da6`**.
- **`master == origin/master`** (in sync). **Tag `v1.21.2`** on origin.
- Production hosting: **https://matrix-arc.web.app** serving v1.21.2.
- **ROLLBACK POINT:** `master → 0f8a61fb`, redeploy **v1.20.142** (#160). Lineage: v1.21.2 = race-removal;
  v1.21.1 = #158; v1.21.0 = #163; v1.20.142 = #160.

## What shipped this session (v1.21.2 / 9c885da6)
Deleted Path A — the fire-and-forget `bcSyncPanelPlanningLines` inside `runPricingOnPanel` (old
27459–27467) + its premature post-pricing POST. Path B (`useEffect → syncPlanningLinesToBC`) is now the
sole foreground auto-sync; task descriptions still sync there (V1 verified, no orphan). Added two
LOAD-BEARING guard comments (#168) at the unpriced-check sites (useEffect ~25115 + syncPlanningLinesToBC
~25160). **Verified live on v1.21.2:** no `Post-pricing BC sync:` line, single `bcSyncPlanningLines:`
summary, happy path 41 created / 0 failed, task descs synced. Removed a genuine duplicate-trigger race
+ redundant BC traffic. Plan: `docs/168-DETAILED-PLAN.md` (Coach). Evidence: `docs/168-C110-RUNTIME-EVIDENCE.md`.

## #168 — TABLED (likely not-a-bug-as-reported)
Re-investigated live this session. **The reported symptom (popup flags VALID in-BC items as
"couldn't sync") did NOT reproduce** once the race was removed. Only reproduction on v1.21.2 = a
LEGITIMATE failure (JOB BUYOFF genuinely not in BC → popup correctly tells the user to act).
- **Disproven:** (a) race-as-popup-cause — `setSyncFailedAlert` is only in the KEPT path
  (`syncPlanningLinesToBC`:25214); deleted Path A only `console.warn`'d. (b) posting-group theory —
  CSD242010SS / A24P20 / ALD2QH211DNUG all have valid `Gen_Prod=INVENTORY` / `Inv=RAW MAT` (Jon verified);
  the "Inventory Posting Group read-only" 400 is ARC PATCHing an already-set field (noise).
- **Why it looked high-volume:** failure count scales with existing BC lines — fresh project POSTs all
  rows (PRJ402129 = 37 fail), re-sync only new/changed (PRJ402130 re-extract = 1 fail). Deterministic
  per-item, not timing.
- **v1.21.2 NOT proven to fix the symptom:** the 37→1 drop is mostly PRJ402130 being pre-populated, not
  the fix. The one untaken test that would settle it: a FRESH project from the SAME drawings on v1.21.2
  (not run — PRJ402129 was deleted). Don't mis-remember v1.21.2 as "the #168 fix."
- **RESUME TRIGGER (crisp):** #168 is live again ONLY if the popup flags a genuinely IN-BC item as
  couldn't-sync. A legitimately-missing item failing (JOB BUYOFF not in BC) is CORRECT behavior, not the
  bug. When live: resume from `docs/168-C110-RUNTIME-EVIDENCE.md` + land **#170 first** (reveals the real
  primary-POST error). Full detail in TODO #168.

## NEW residual bugs logged (both LOW, NOT started)
- **#170** — Primary `Type:"Item"` planning-line POST error is discarded at `app.jsx:~3762`; only the
  `Type:"Text"` fallback's "Type must not be Text" is surfaced. Masked #168's real error all session.
  The `Type:"Text"` fallback on `Project_Planning_Lines_Excel` is also dead logic (BC rejects Text).
  **Land before any future #168 dig.** (Coach's held Q2.)
- **#171** — JOB BUYOFF auto-cross to BUYOFF not applied to default BOM line before sync (ARC POSTs
  pre-cross name). Cosmetic/low.

## Open work queue
**Actionable HIGH (no gate):**
- **#164** — Reconciliation Deleted→"Keep" may strip crosses (possible data loss, untested branch).
- **#165** — Reconciliation Accept/Reject verbs read backwards (UX, data-loss risk).
- **#159** — Copy-to-New-Quote customer selection (scope ready: `docs/159-COPY-CUSTOMER-SCOPE.md`).
- **#160** — ReconciliationModal Changed rows offer only "Accept", no reject.

**LOW / parked:** #170, #171 (this session, BC sync residuals). #169 (prior-quote recognition) parked
at Brief-stage — needs Jon to resolve Forks A/B. #161/#162, #166 (LOW). #167 closed NO-BUG.

**#163 production cutover — STILL GATED:** needs a prod BC env (does not yet exist). `bcEnvironment` =
`MATR_SndBx_01152026` (SANDBOX). Next trigger: Jon brings the Excel mapping sheet → Coach `bcNo`
sole-reference trace → reconciliation script → dry-run → live. Full detail in TODO #163.
**#163 follow-ups (GitHub):** GH #2/#3/#4.

## Working tree / handoff
- v1.21.2 deployed; master == origin/master.
- `COACH.md` + `docs/168-BC-SYNC-DIVERGENCE-SCOPE.md` + `docs/168-DETAILED-PLAN.md` modified/untracked by
  Coach this session — **left for Coach to commit** (Coach-owned).
- Marc committed: TODO updates (#168 reframe, #170, #171), `docs/168-C110-RUNTIME-EVIDENCE.md`, handoff files.
