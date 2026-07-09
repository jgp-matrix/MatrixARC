# Session State — 2026-07-08 MDT (regen at close-out · PROVEN B012 data-loss incident · Phase B fix built + HELD for live matrix · no prod deploy)

## Version
**v1.23.3** (PRODUCTION — UNCHANGED this session). **No deploy occurred** — all session work on master is docs / TODO / traces / handoff. The one production code change (Phase B) is intentionally **held on a branch**, not merged/deployed.

## Deploy State
- **Master tip:** `2dd2e468` (triage close-out; docs/TODO only — `51351beb`→`cdb3ed76`→`2dd2e468`, no code/deploy). `master == origin/master`. **No prod deploy this session.**
- Production: **https://matrix-arc.web.app** still serving **v1.23.3** (baseline).
- **Retained branch (intentional):** `claude/phase-b-bom-merge` (commit `bd9134a9`, **PR #5**) — the Phase B row-merge, now **SHELVED** (superseded as the primary B012 fix by the hard one-editor lock, Jon 2026-07-09). Retained as a possible future backstop for same-user-two-tab + background-write residuals. **Do NOT auto-merge/deploy it.**
- **Working tree:** clean.

## ⭐ NEXT UP — Freddy leads (ranked)

**1. ★★ B012 FIX — HARD ONE-EDITOR LOCK (editing lease). STRATEGY PIVOT (Jon, 2026-07-09).** The primary B012 fix is now a **hard, automatic one-editor-per-project lock** (server-enforced editing lease on the project doc, same pattern as `quotePrintLock`) — a 2nd user is truly **read-only** until the editor leaves. **Why the pivot:** the current guardrail does NOT hard-block concurrent edits — Owner Priority Mode allows row/field edits; the only server write-lock (`isOwnerPriorityLocked`, `firestore.rules:202`) needs the owner to manually set `ownerLockActive`; the 90s presence lock is client-side only. B012 clobbered PRJ402096 *with guardrails in place*. **State:** Brief + finalized rulings → `docs/B012-HARD-LOCK-BRIEF.md`; Coach **C139 v2 delivered + Jon-APPROVED (2026-07-09, ship-P1-first)** → `docs/B012-HARD-LOCK-COACH-PLAN.md`; **Marc building P1** (core lock + read-only + 3-state open-time modal — ships the B012 guarantee alone; P2 request/grant · P3 force+warning · P4 priority-hold+admin follow as gated phases). Crash + priority-hold → lease frees after ~90s staleness (Jon confirmed). **Rulings locked (Jon 2026-07-09):** lock held-while-open / released-on-exit (NO idle TTL); first-accessor edits, others view-only; ownership (Salesman/createdBy) permanent + separate; request-access → holder grants; force-takeover only after 30-min inactivity + warning/grace; "hold priority while away" (`ownerLockActive`) blocks all takeovers, admin-only override; per-project; holder-prints-only; 2nd tab per-session view-only. Per-phase pipeline: Marc build → Coach rules+client review → Jon deploy sign-off (test channel FIRST, client+rules deploy TOGETHER since rules are project-wide). **P1 ships → relax the manual one-editor containment.** **Phase B (PR #5) is SHELVED + retained** as a possible backstop — NOT merged/deployed; live matrix + Marc's (completed, read-only) watcher stood down. Manual one-editor containment holds until the lock ships.
**2. B013 — chronic multi-user BC-connection reliability** (escalated tonight). Andrew's & Ryan's pills are OFTEN RED; Jon's stayed GREEN-but-dead. BC healthy at the account level (Marc's session 200s) → per-session token degradation. Fix: honest health indicator (probe validity) + auto-reconnect/retry-on-401 + token refresh. **Morning wedge:** compare Jon's green-but-dead vs Andrew/Ryan's honest-red-then-reconnect.
**3. B016 — mutation write-race/delay under PRJ402096's on-open BC churn.** Adds render late (persist though), lead-time + Est-Prod-Done-date edits revert, deletes don't stick. Fix: reduce the on-open churn + await/confirm every add/edit/delete. **Phase B does NOT fully cover this** (its merge is new-rows-only, not field edits).
**4. Recovery — re-add 534013 + 534042 to PRJ402096** (need pricing) once Phase B ships / under containment; de-dupe panel-1's duplicate BUYOFF/CRATE.
**5. B017 — special-char part numbers 400 the BC price/invoice lookups** (OData `$filter` escaping); + stop PATCHing read-only pseudo-items (BUYOFF/CONTINGENCY).
**6. B018 — send-block overlay clarity** (shows only pricing-incomplete, not all red rows); confirm the pricing-blocks-vs-lead-time-RFQs split is intentional + fix presentation; investigate why 4 non-stale rows render red (`_isBomRowFlaggedRed` vs send-block predicate).
**7. #192 BUDGETARY false auto-revert** — fix FIRMED + ship-approved (pre-tonight queue): two gates before the auto-revert prompt. Spec: `docs/192-FREDDY-FIX-BRIEF.md`.
**8. G005 §10-8 prod-regression smoke** (deferred from session start) — confirm v1.23.3 prod BC write + email fire normally.
**9. Features cluster F004/F005/F007/F008** (build-ready batch) · **Bugs cluster B008/B011/B005**.
**10. G005 Phase 2** (separate Firebase project + test user — the real data-collision fix + unblocks the mutating-tail demo).

## What happened this session (2026-07-08) — the PRJ402096 concurrent-edit incident
- **B012 CONCURRENT-EDIT DATA LOSS — CRITICAL, PROVEN.** Jon + Andrew editing PRJ402096 concurrently clobbered each other's BOM rows. Root (Coach C137 + Marc runtime): whole-document `ref.set()` saves, NO row merge → last-write-wins; 3 mechanisms (M1 save-on-open stale-init [legacy-only], M2 overwrite-on-save, M3 soft-apply-replace), amplified by burst saves overflowing the Firestore write queue. **Proven instance: 534013** (added by Jon pre-Andrew, reached BC planning-lines, absent from Firestore = clobbered in Andrew's 22:36–22:50 burst); 534042 also gone. **Fix = Phase B** (row-level merge + baseline delete-safety + soft-apply merge). Phase A (stale save-on-open removal) folded in — legacy-only, doesn't affect PRJ402096. Plan `docs/BOM-MERGE-PHASE-B-PLAN.md`; matrix `docs/PHASE-B-MATRIX-SCRIPT.md`; snapshot `docs/PRJ402096-BOM-SNAPSHOT-2026-07-08T2259Z.md`; investigation `docs/PRJ402096-BC401-CODALE-INVESTIGATION.md`.
- **B013 escalated** to chronic multi-user BC connection reliability (see NEXT UP #2).
- **B016 re-scoped** from "add fails" to a general mutation write-race/delay (see #3).
- **New: B017** (special-char PN pricing 400s), **B018** (send-block overlay clarity).
- **Earlier tonight (pre-incident):** the "61 items could not be pushed" = transient BC OAuth 401 (recovered) — folded into B013.

## Key state carried forward
- **CONTAINMENT LIVE (until Phase B ships): ONE editor per project, ALL projects.** Concurrent editing destroys rows. **Jon is holding sales off ARC** until Phase B + the BC-connection fix land — sound call.
- **Team lane assignments unchanged.** Marc built Phase B (branch/PR); Coach C134–C138 logged + reviewed PASS; Dez board reflects the incident.
- Pre-tonight queue (G005 §10-8 smoke, #192, clusters, backlog pass) all still open, deprioritized under the data-loss fix.

## Team workflow state (unchanged; see CLAUDE.md)
- Per-phase gating; hub-and-spoke through Freddy; deploy is a Jon checkpoint. Phase B's prod deploy is explicitly Jon-gated after the live matrix.

## Session lessons (carry-forward)
- **On live/intermittent/timing bugs, hold the diagnosis LOOSELY and get the decisive artifact before concluding.** Tonight several confident root-cause calls were overturned by the next data point (deterministic-add-bug → actually a delay; dead-token → also a client search-results race candidate). The row-count / audit-log / cross-session checks were what actually settled things. Reinforces [[feedback_surface_first_and_instrument_timing_bugs]].
- **A whole-document save with no row-level merge is a data-loss bug waiting for concurrency.** The fix pattern: row-level union-merge keyed by stable ids + a client-carried baseline to honor deletes (Phase B).
- **BC connection health ≠ "a token exists."** The indicator must probe validity; a stale-but-present token reads as connected while every call fails.
