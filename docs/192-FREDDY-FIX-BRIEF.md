# #192 — BUDGETARY false auto-revert on open — FIX DIRECTION (firmed)

**Author:** Freddy Lyst (Analyst) · **Date:** 2026-07-07 · **Status:** Fix firmed → build-ready (pending a decision on ship-now-vs-repro-confirm) · **Traced @** `5ad72fbe`
**Builds on:** `docs/192-BUDGETARY-REVERT-REGRESSION-TRACE.md` (Marc, mechanism) + `docs/192-ISBUDGETARY-AUTO-SET-TRACE.md`.

## The bug (confirmed mechanism)
The auto-revert effect (app.jsx:37586-37630) fires on `_leadDriversSig` change. On project OPEN, a **background pricing/lead-time refresh** mutates rows → changes `_leadDriversSig` → the effect re-fires **mid-reprice**. If the reprice drives `projectRef.current` to a **momentary all-non-red state that persists ≥600ms** (prices freshened + lead times populated before a later update re-flags rows), then at the 600ms timeout `_hasRedRows(latest)` reads **false** on a project that is actually red once settled → the **"Remove the Budgetary flag now?" dialog fires falsely** (Noah watched it, OK'd it → budgetary cleared on a still-red project).

Not a silent clear (it's gated on the `arcConfirm` dialog) and not a stale closure (the guard re-reads the live ref at fire-time). The one hole: the fire-time read can catch a **mid-reprice transient**.

## The fix (firmed — two gates, correct-by-construction)
Harden the fire path so the prompt requires a **SETTLED + STABLE** clean state:

**Gate 1 — SETTLED (no in-flight background reprice).** In the 600ms timeout, before prompting, bail if a background pricing/lead-time task is in flight for this project. **The signal is already in hand** — the instrumentation at 37605 reads `_bgTasks` (`bgTasksInFlight`). Use `_bgKey(projectId, panelId)` across the project's panels; if any pricing task is in flight → **do not evaluate** (return; the effect re-fires when the reprice completes and changes the sig → then it evaluates on the settled state). This directly targets the mechanism (the false fire happens DURING the open-reprice).

**Gate 2 — STABLE (double-check after a settle).** Require `_hasRedRows(latest)===false` at fire-time AND again after a short additional settle (~500ms re-check) before prompting. A mid-reprice transient clean state won't survive the second read (the later red-causing `update()` lands) → bail. Cheap belt in case a reprice path doesn't register in `_bgTasks`.

```
// inside the 600ms timeout, replacing the single guard at 37616:
const latest=projectRef.current;
if(!latest||_hasRedRows(latest)||!_hasArcAutoBudgetary(latest))return;
// Gate 1 — settled: don't evaluate mid-open-reprice
if(_projectHasInflightPricing(latest)) return;        // check _bgTasks via _bgKey across panels
// Gate 2 — stable: re-confirm clean after a short settle
await _sleep(500);
const settled=projectRef.current;
if(!settled||_hasRedRows(settled)||!_hasArcAutoBudgetary(settled))return;
// …then arcConfirm + _clearAutoBudgetary as today
```

**Why correct-by-construction:** both gates only ADD conditions before firing a **destructive** auto-prompt. Making a destructive auto-action more conservative cannot make things worse — worst case it fails to prompt in a genuine "all reds resolved" case, and the user can still clear Budgetary via the manual checkbox. It **preserves** the legitimate behavior: when a user resolves the last red row, there's no in-flight pricing + the clean state is stable → the prompt fires normally.

(Option 3 from the trace — only fire on a user-driven red→clean transition, ignoring `_leadDriversSig` churn from background pricing — is the ideal but more invasive; defer unless Gates 1+2 prove insufficient against Noah's repro.)

## Ship-now vs repro-confirm — a decision for Jon
The mechanism is **strong-inferred, not yet directly observed** (Marc couldn't deterministically catch the transient; awaiting Noah's repro with the live `[#192 REVERT-FIRE]` instrumentation). Two paths:
- **(A) Ship the conservative fix now** — it's correct-by-construction + LOW-risk, and #192 is an **actively-observed** regression (Noah saw the false uncheck), so unlike B009 there's real evidence it's live. Keep the instrumentation ONE more cycle to confirm the false fire stops, then strip it.
- **(B) Wait for Noah's repro first** — let the `[#192 REVERT-FIRE]` log capture `hasRedRows:false` + `bgTasksInFlight>0` at a real false fire (confirms the mechanism + that Gate 1 would catch it), THEN ship the validated fix.

**Freddy lean: (A)** — the fix can't regress the legitimate path, the bug is observed-active, and clearing a customer's Budgetary flag on a still-red quote is a real quoting-integrity risk. Ship + keep instrumentation one cycle.

## Coach/Marc to confirm at build
1. Does the open-time background reprice register in `_bgTasks` (keyed `_bgKey(projectId,panelId)`)? If it uses a different async mechanism, adjust Gate 1's settled-signal (Gate 2 covers it regardless).
2. The auto-revert effect is project-level; `_bgTasks` is keyed per panel → check across all `project.panels`.
3. Strip the `#192 TEMP INSTRUMENTATION` (1574-region + 37602-37615) only AFTER a clean confirmation cycle.

## Acceptance
- Open a red project with auto-set Budgetary + a background reprice on open → **no false "Remove Budgetary?" dialog**; Budgetary stays on; reds settle.
- Genuinely resolve the last red row (settled, no in-flight pricing) → the prompt **still fires** correctly.
- `[#192 REVERT-FIRE]` log (kept one cycle) shows no `willPrompt:true` on a project that settles red.
