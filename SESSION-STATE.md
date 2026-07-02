# Session State — 2026-07-01 MDT (#182 verified · #187/#191 shipped · #192 regression · #193 pending-verify)

## Version
**v1.21.23** (deployed 2026-07-01, PRODUCTION). Ten patch bumps this session over v1.21.13:
- v1.21.14 = #187 Phase 2 (customer tier + relocation)
- v1.21.15–.18 = #187 relocation fix + right-justify (on-screen + PDF)
- v1.21.19 = #192 widen BUDGETARY auto-set to all red rows (⚠ regression, see below)
- v1.21.20 = #191 quote-# assign on all send paths + subject recompute
- v1.21.21 = #192 TEMP instrumentation ([#192 REVERT-FIRE] log)
- v1.21.22 = #191 4th-path closer (handleGeneratePdf)
- v1.21.23 = #193 Send-To-Sales tab
- (v1.21.12/.13 earlier = #186 guard / #187 Phase 1)

## Deploy State
- **Master tip:** `1e9129c2` ("Release v1.21.23"). **`master == origin/master`** (in sync). No feature branches.
- Production hosting: **https://matrix-arc.web.app** serving v1.21.23. All session code committed + deployed.
- **#192 instrumentation is LIVE** (temporary, tagged "#192 TEMP INSTRUMENTATION" — the `_redReasonBreakdown`
  helper + the "[#192 REVERT-FIRE]" log at ~app.jsx:37246). STRIP it after the #192 regression fix.
- Uncommitted at close-out (left for their owners): Coach's untracked docs (plans/verifications/supplements),
  `.gitignore`, `.claude/settings.json`, `tools/arc-*.sh` — Coach commits these at Coach's close-out.

## ⭐ NEXT UP — analyst leads (top 10 · #192 REGRESSION first)

**Start here.** Take the reins per your Startup Directive. Top priority is the #192 regression (teed up at #1);
the rest is the ranked fallback (re-prioritize if you see a better next move).

1. **🔴 #192 REGRESSION (TEED UP — do first)** — auto-revert CLEARS BUDGETARY on red-row projects on OPEN
   (Noah watched it uncheck). Mechanism strong-inferred (NOT directly observed): background reprice on open
   transiently drives all-non-red ≥600ms → `_hasRedRows(latest)` false at the debounced fire (~app.jsx:37246) →
   false "Remove Budgetary?" dialog. **Instrumentation is LIVE (v1.21.21)** — the "[#192 REVERT-FIRE]" console
   log appearing AT ALL confirms the transient. **Awaiting Noah's intermittent repro w/ console open.** FIX
   DIRECTION: don't auto-revert on the initial-open / bg-reprice re-fire; require a STABLE clean state (re-check
   after settle) before prompting. Then STRIP the instrumentation. Trace: docs/192-BUDGETARY-REVERT-REGRESSION-TRACE.md.
2. **#193 Send-To-Sales — VERIFY** (v1.21.23, done-pending) — Jon verify + Coach verify: default tab = Send To
   Sales, recipient pre-fills own email (editable), tab-switch swaps recipient, real-send semantics, writes
   `quote_send` to `qvHistory[]`. Plan: docs/193-SEND-TO-SALES-BUILD-PLAN.md.
3. **#188 validate-at-push vendor fix** (MED, plan APPROVED, shovel-ready) — two-tier (#184-safe); heals
   PRJ402124's V00102 rows on next push. Build not started. Plan: docs/188-VALIDATE-AT-PUSH-PLAN.md.
4. **#197 ship-date on PO Received modal** (MED) — compute calendar ship date = PO received date + lead time
   (ARC only stores duration today); mismatch OA messaging. PREREQ: Coach reads the lead-time formula → Brief.
5. **#196 locked-quote overlay covers Receive PO** (LOW-MED, latent) — lock shouldn't gate forward workflow
   (PO receipt). Trace not run. Workaround: unlock.
6. **#198 Client Review approval step** (MED) — no "Approved" action; project stuck "Client Review In Progress —
   Edits Locked". Add a client-facing approve that clears the lock. (Renumbered from #191.)
7. **#190 "Save Defaults" → "Save" relabel** (LOW) — pending Coach confirm the button commits the full modal.
8. **#184 push concurrency** (LOW) — Firestore "resource-exhausted" under broad Push (adjacent to #182).
9. **#185 Send-RFQ Contacts dropdown** (LOW) — looks inert (correct dedup) + InterMtn duplicate-email artifact.
10. **#194 global ARC email/metrics + click-tracing** (feature placeholder) — #193's `quote_send` log is the
    first feed. Needs a Brief.

Further carry (below the top 10): #195 (cosmetic — Print-as-Firm checklist shows auto-flagged BUDGETARY on
override), #176/#177 (LOW residuals), #58/C15 Parts 2/4/7, #165(A) pending Jon eyeball, #159 (Copy-to-New-Quote),
Coach C118 (#165 detector-diff).

## What shipped this session
- **#182 (v1.21.11 `7cf55a82`) — Item Vendor EntityWithSameKeyExists.** 3-part PATCH key fix. **T3 VERIFIED
  LIVE 2026-07-01: 32 collisions → 0.** RESOLVED.
- **#187 (v1.21.13→.18) — quote-validity cascade + valid-until relocation + PDF right-justify.** 4-tier cascade,
  single-source `project.quoteExpiresAt`; Phase 1 (`543e1700`) + Phase 2 customer tier (`ee085025`); combined
  valid-until row (doubling + PDF orphan fixed), on-screen right-justified, PDF right-aligned. RESOLVED.
- **#189 — global default won't persist.** Not a defect (Jon hadn't clicked "Save Defaults"). RESOLVED; relabel → #190.
- **#191 (v1.21.20 `896c2e6e` + v1.21.22 `6ed639b5`) — quote # missing.** New idempotent `ensureQuoteNumber`;
  all 4 quote-PDF paths assign before build; subject recompute. Backfilled PRJ402119→MTX-Q202030,
  PRJ402118→MTX-Q202031. RESOLVED (Noah confirms send-flow as backstop).
- **#192 (v1.21.19 `a30d975c`) — widened BUDGETARY auto-set to all red rows** (14 sites). DONE, but see the
  🔴 regression above (auto-revert false-clear on open).
- **#193 (v1.21.23 `39c8d6ac`) — Send-To-Sales tab.** DONE-PENDING-VERIFY.

## New findings logged this session
- **#188** (MED) stale/phantom bcVendorNo on Push (plan approved). **#190** (LOW) Save relabel. **#192 regression**
  (🔴 top priority). **#194** (feature) metrics. **#195** (LOW cosmetic) Print-as-Firm checklist. **#196** (LOW)
  locked overlay covers Receive PO. **#197** (MED) ship-date on PO Received modal. **#198** (MED) Client Review
  approval step (renumbered from #191). See TODO.md for full text.

## Team workflow state (2026-07-01)
- **Terminal-Freddy trial:** config flipped (`analyst.environment=terminal`, `hasFileAccess=true`) but **NOT yet
  in use** — Freddy still runs in the browser (Claude.ai); deliver Freddy-bound content as files + Explorer
  `/select`. See the cross-session-messaging lesson below (keep all roles in CCD Desktop, not Terminal).
- **Controlled-tab title marker:** the Claude-driven tab is stamped `🤖 CLAUDE-CONTROLLED ▸ ARC`
  (`document.title`), re-stamped after every reload/navigation (app resets it). Per CLAUDE.md.

## Session infrastructure lessons
- **Controlled-tab instability:** heavy in-page JS (recursive React-fiber scans, large JSON.stringify dumps)
  FREEZES/kills the Claude-in-Chrome tab. Keep probes lightweight (small DOM queries, bounded returns). Reading
  Firestore/company data: capture companyId via a lightweight `firebase.firestore().collection/doc` path-logger
  patch, then read `companies/{cid}/…` directly (the app renders from the company-scoped source, NOT
  `users/{uid}/projects` — legacy). The MCP console reader does NOT reliably capture the app's own console.log
  (e.g. `[BG PRICING]`/`[LEAD DRIVERS]`) — use a real DevTools console for those.
- **Separate tabs share Firestore data but NOT in-memory state** — Jon's app session and Marc's controlled tab
  are distinct; durable evidence (debug logs, project docs) is readable cross-tab, live UI state is not.
- **Prod load-failure 2026-07-01 = Fastly Denver POP (DEN) edge timeout, NOT ARC.** `X-Served-By: cache-den-*`
  (Firebase Hosting is fronted by Fastly). Origin was healthy throughout (version.json served, Firebase/Google
  status clean, firebase.json intact — no deploy broke it). Regional/edge, recovered on its own. Response:
  confirm-and-wait, NO redeploy (a redeploy re-pushes the same origin, does nothing for a Fastly edge).
- **Cross-session messaging (`mcp__ccd_session_mgmt__send_message`) — tested 2026-07-01:** CCD↔CCD works
  two-way. An idle Desktop window ingests an injected turn immediately and can reply back (tool returns
  "Message sent", not "queued"). **TERMINAL sessions CANNOT receive** — the send queues (registry
  `lastActivityAt` advances) but a Terminal CLI never surfaces/processes the turn, even when idle or nudged
  with a keystroke. So **keep all team roles in CCD (Desktop) windows, not Terminal.** Each session must be in
  **"Ask permissions"** mode for its OUTBOUND sends to fire — Auto/Bypass disables the tool entirely (that's
  why sessions boot unable to send: global `defaultMode` is `bypassPermissions`). The per-send **"Allow Once"
  prompt is HARDCODED** — NOT suppressible by permission allowlist or any mode. Accepted as the cost of the
  three-independent-window workflow; do NOT re-test. For unattended runs, fall back to repo-commit handoff.
