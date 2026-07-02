# Freddy — #192 regression trace: BUDGETARY unchecks on opening a red project (READ-ONLY)

**To:** Freddy · **From:** Marc · **Date:** 2026-07-01 · **Runtime trace, no fix, no writes**

## What's decisive (code + runtime)

1. **No silent clear path.** `isBudgetary` is written in exactly two places: the manual checkbox
   (`saveSelectedPricing({isBudgetary:e.target.checked})`, ~35719) and `_clearAutoBudgetary` (1564,
   called only at 37254). The auto-revert clear is **gated on an `arcConfirm` dialog** (37248) — it
   cannot clear silently. So Noah's "watched it uncheck itself" = the **"Remove the Budgetary flag
   now?" dialog fired on a still-red project** (a false-positive prompt), then got OK'd.

2. **The fire-time guard re-reads the LIVE ref — NOT a stale closure (refutes hypothesis #3).**
   Inside the 600ms timeout: `const latest=projectRef.current; if(!latest||_hasRedRows(latest)||
   !_hasArcAutoBudgetary(latest))return;` (37246-37247). `latest` is read at fire-time from the live
   ref. So the dialog fires ONLY if `_hasRedRows(projectRef.current)` is **FALSE at t+600ms** on a
   project that is red once settled.

3. **A plain open does NOT reproduce it — refutes the "BOM un-hydrated on open" variant.** I opened
   PRJ402096 (52 red rows, sentinel auto-set, budgetary ON). After ~14s: budgetary **stayed
   checked, no dialog**, 52 reds robustly present. The BOM is stored inline on the project doc, so
   reds are visible immediately on mount → the first effect run sees `hasRed=true` → resets the
   one-shot and returns → never schedules. So the false-clear is NOT plain load-hydration.

## The remaining viable mechanism (fire-time transient)

The auto-revert effect's dependency is **`_leadDriversSig`** (37205/37261) — a signature of rows
with `leadTimeDays>0`. It re-fires whenever a lead time changes. On open, a **background pricing /
lead-time refresh** mutates rows (populates `leadTimeDays`, freshens `priceDate`) and calls
`update(...)`, changing `_leadDriversSig` → the auto-revert **re-fires mid-refresh**. If that refresh
drives `projectRef.current` to a **momentary all-non-red state** that persists ≥600ms (e.g. prices
freshened + lead times populated before a later step re-flags some rows, or the final red-causing
update lands >600ms after a transient clear), then `_hasRedRows(latest)` is **false at fire-time**
even though the project ends up red → the dialog fires. This is the only way `_hasRedRows` (a live-ref
read over an inline BOM) can be false while the project is red.

**I could not deterministically catch the transient in the controlled tab:** a plain open of a
52-red project didn't trigger it, and the MCP console reader doesn't capture the app's
`[BG PRICING]`/`[LEAD DRIVERS]` logs, so I can't observe the reprice's intermediate `update()`
sequence. Confirming the exact fire-time value needs a one-line instrumented branch build (log
`_hasRedRows(latest)` + a per-reason red breakdown at 37246) run against Noah's live repro.

## At-risk population (runtime)
11 projects carry the auto-set sentinel (`isBudgetaryAiAutoSet`). Clarification: **PRJ402089 &
PRJ402079 have sentinel=true but isBudgetary=false while still red** — that's a **manual uncheck**
(the checkbox sets isBudgetary false without touching the sentinel), NOT auto-revert evidence (a real
auto-clear removes the sentinel too, leaving no trace). So they are not proof of the bug, just
inconsistent leftover state.

## Fix direction (yours to scope — NOT implemented)
The guards are logically correct; they just act on a possibly-transient fire-time read. Options:
- **Don't auto-revert on the initial open / background-reprice re-fire** — only prompt on a genuine
  user-driven red→clean transition (e.g. ignore the first effect run after mount, or gate on a
  "user edited lead/price" flag, not on `_leadDriversSig` churn from background pricing).
- **Require the clean state to be stable** — re-check `_hasRedRows` twice (e.g. at fire-time AND
  after a short settle) before prompting, so a mid-reprice transient can't trigger it.
- **Confirm the project is settled** (no in-flight background pricing) before evaluating.
Any of these keeps the legitimate "all reds resolved → offer to clear" behavior while killing the
mid-open false positive.
