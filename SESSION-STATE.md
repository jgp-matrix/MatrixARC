# Session State — 2026-07-06 MDT (regen at startup · F001 Brief written since last regen · #199 SHIPPED v1.21.25 · team protocols current)

## Version
**v1.21.25** (deployed 2026-07-03, PRODUCTION). Shipped #199 (Tech Review flag) + two in-pass fixes + #17.

## Deploy State
- **Master tip:** `52a1e9ef` (F001 Brief — interactive quote-building walkthrough; docs-only). **Release commit = `333f385d` (v1.21.25)**. `master == origin/master` (in sync, verified at 2026-07-06 startup). No feature branches.
- Production hosting: **https://matrix-arc.web.app** serving **v1.21.25**. All app code committed + deployed. Every commit since `333f385d` is dev-tooling / docs / orchestration only (no `src/` change) — production is still v1.21.25.
- Working tree CLEAN.

## ⭐ NEXT UP — analyst leads (top 10)

**Take the reins per your Startup Directive.** This list is ranked by priority — pick the best next move (several are teed up). #192 remains the top open *bug* but is EVIDENCE-GATED; the first genuinely-unblocked moves are the G002 live test, #200/F001, and #193 verify.

0. **F002 — BOM column reorg / indicator cleanup (ACTIVE — Marc BUILDING, Jon-approved)** — declutter the BOM (Ref|TR|Qty|Status|🔍|Part#), unified tri-state BC circle (R1), AI+manual→grey-italic / BC→white (R2), remove marker pills, add data-tour anchors. Coach Plan Rev 1 §10 authoritative. After build+validate_jsx → live-verify matrix-arc-test → Coach review → Jon deploy checkpoint. Brief: docs/F002-BOM-COLUMN-REORG-BRIEF.md; Plan: docs/F002-COACH-SUPPLEMENT-AND-PLAN.md §10.
0b. **F001 — Interactive quote-building walkthrough (⛔ BLOCKED BY F002)** — gated hands-on walkthrough + Help-button + reusable engine. **Do NOT start (incl. step collection) until F002 ships** — F001 targets F002's new columns + data-tour anchors (Jon 2026-07-06). Brief: docs/F001-QUOTE-WALKTHROUGH-BRIEF.md.

1. **🔴 #192 REGRESSION (top bug, but EVIDENCE-GATED — not team-actionable yet)** — auto-revert CLEARS BUDGETARY on red-row projects on OPEN (Noah watched it uncheck). Mechanism strong-inferred (background reprice on open transiently drives all-non-red → `_hasRedRows(latest)` false at the debounced fire ~app.jsx:37246 → false "Remove Budgetary?" dialog). **Instrumentation LIVE (v1.21.21)** — the "[#192 REVERT-FIRE]" console log appearing AT ALL confirms it. **Blocked on Noah's intermittent repro w/ console open.** FIX: require a STABLE clean state (re-check after settle) before auto-revert; then STRIP instrumentation. Trace: docs/192-BUDGETARY-REVERT-REGRESSION-TRACE.md.
2. **G002 launcher — LIVE FRESH-BOOT CALIBRATION (teed up, unblocked)** — the launcher is Coach-approved (v3), AHK path baked (`01099977`), desktop shortcut `Boot ARC Team.lnk` + printable `ARC-Team-Startup.html` runbook created, `-WhatIf` clean. Only the live run remains: at a clean boot, run it and confirm `Ctrl+N` creates EXACTLY 4 sessions (the #1 unknown — silent-stack risk if the shortcut's wrong), then tear-off/title/comms-check. TODO G002.
3. **#200 — Quota-aging project-tile color-shift (Brief written, ready to pipeline)** — shift dashboard tile color as a project ages toward its Sales quota deadline (anchor createdAt, un-quoted-only + sending stops it, business days, fixed offsets). Next step: Coach Supplement → Analyst Review → Plan. Brief: docs/200-QUOTA-TILE-AGING-BRIEF.md.
4. **#193 Send-To-Sales — VERIFY** (v1.21.23, done-pending) — Jon + Coach verify default tab, recipient pre-fill, tab-switch, real-send semantics, `quote_send` in `qvHistory[]`. Plan: docs/193-SEND-TO-SALES-BUILD-PLAN.md.
5. **#188 validate-at-push vendor fix** (MED, plan APPROVED, shovel-ready) — two-tier (#184-safe); heals PRJ402124's V00102 rows on next push. Plan: docs/188-VALIDATE-AT-PUSH-PLAN.md.
6. **#197 ship-date on PO Received modal** (MED) — calendar ship date = PO received + lead time. PREREQ: Coach reads the lead-time formula → Brief.
7. **#198 Client Review approval step** (MED) — add a client-facing "Approved" action that clears the "Client Review In Progress — Edits Locked" state.
8. **B003 — Review Supplier Quote modal lists unquoted parts** (Backlog) — hide non-quoted lines (declutter). New this session.
9. **#196 locked-quote overlay covers Receive PO** (LOW-MED, latent) — lock shouldn't gate PO receipt. Workaround: unlock.
10. **#190 "Save Defaults" → "Save" relabel** (LOW) — pending Coach confirm the button commits the full modal.

Further carry: B005 (resolved-TR-row re-arm — TR-tuning), G005 (matrix-arc-test prod-Firestore isolation — before launch), #184/#185 (LOW), #194/#195, #176/#177, #58/C15 Parts 2/4/7, #165(A), #159, Coach C118.

## What shipped this session
- **#199 — Per-line Tech Review flag + hard send-gate. SHIPPED v1.21.25, RESOLVED.** Per-BOM-line Tech-Review checkbox; auto-stamps on supplier crosses (`@38978`, unconditional → a supplier re-cross re-arms a resolved row); hard send-gate across all 7 send surfaces; reviewer per-row Resolve + approve-sweep (MED-2 no-partial-write). Full **T1–T18 live-passed** on matrix-arc-test (Jon co-drove the React-checkbox clicks; Marc ref-drove buttons + verified). Dispositions: T3 covered-by-design (flag rides isCrossed lifecycle), T7 superseded by P3, T12 N/A-by-design (read-only resolved is §2.2-compliant + safe). Commits: P1 `13f06fcf`/`66494253`, P2 `a5253d42`, P3 `a0e39335`, MED-3 `c46184aa`, await-fix `41824f6c`, count-fix `107b960b`, release `333f385d`. Coach chain: P1/P2/P3 + MED-1/2/3 verified, persist-trace `186da1fe`, await sign-off `41ddfc28`, count re-verify `29d9ea09`.
- **B004 — Portal Apply unawaited-save reload-race. RESOLVED `41824f6c` (shipped w/ #199).** `doApplyPortalPrices` persisted via a fire-and-forget `safeSave` → an immediate reload could beat the write and revert cross+flag+prices. Fix: `await safeSave` @38302. Pre-existing since v1.19.722; surfaced during #199 live pass.
- **Jon-found multi-line COUNT bug — fixed `107b960b`.** Send-button/modal showed "1 incomplete" regardless of count (banner was correct); P3 pushed one issue per PANEL. Fix: one issue per unresolved TR row.
- **#17 — arcDocOpen fire-and-forget fallback (`.catch`).** Shipped in the same hosting build (`0651a73c`).

## New findings logged this session
- **G005** (infra) matrix-arc-test shares PROD Firestore — isolate before real customers. **B003** (Backlog) Review-Supplier-Quote modal lists unquoted parts. **B004** (RESOLVED, above). **B005** (LOW/tuning) resolved-TR-row can't be manually re-armed. **#200** (Brief written, queued). See TODO.md B/F/G Tracker.

## Team workflow state (2026-07-03) — IMPORTANT, changed this session
- **★ PER-PHASE GATING (Jon-in-the-loop).** Jon flagged that the team moved so fast he was reduced to clicking "Allow Once" while questions got self-solved before he could answer. New protocol: the team **HOLDS after each phase** for Jon's explicit "go"; a **question to Jon FREEZES the whole team** (no self-solving/working around it); **Freddy MINIMIZES cross-session sends** (each is a hardcoded per-send Allow-Once prompt = noise); **deploy is its own Jon-released checkpoint**; **"HOLD"/"STOP" from Jon freezes all sessions.** (memory: gating-per-phase-jon-in-loop.)
- **★ CLOSE-OUTS RUN FROM FREDDY** (Jon ruled 2026-07-03, twice) — like startup (Freddy took startup 2026-07-02). Freddy orchestrates the close-out directly (owns SESSION-STATE/FREDDY.md/TODO). **Mechanism follow-up:** `.claude/commands/team-closeout.md` still says "Implementer orchestrates" + team-config has no close-out orchestrator field → update to analyst/Freddy (routes to tooling owner). (memory: freddy-runs-closeouts.)
- **Comms finding (per-send Allow-Once).** Live-tested: the cross-session `send_message` Allow-Once is **per-SEND, not per-target** — a repeat send to an already-approved target STILL prompts (refutes the earlier "per-target memory" read). Hardcoded, no allowlist can suppress (G001). **UPDATE 2026-07-02: Bypass Permissions mode explicitly tested (Jon confirmed the mode was set on the sending Freddy session) — prompt STILL fired.** So G001 extends to Bypass Permissions; the prompt is baked into the `send_message` tool itself (spec: "ALWAYS prompts"), outside the permission system entirely. No mode suppresses it. Only lever = fewer sends (→ the batching/gating above). *(Jon tabled the deeper comms investigation — do not re-open unless he resumes it.)*
- **Hub-and-spoke + hybrid routing** unchanged (see CLAUDE.md): all cross-role messaging routes through Freddy; low-stakes mechanical → subagents (ask Jon first, ON PROBATION); high-stakes → the 4 standing sessions.

## Loose ends — test-data cleanup (2026-07-03, low-value; test data, Jon-cleared, note-only)
- **PRJ402097 "Villages Clarifier"** — left in "Pre-Review Approved by Designer" state + 3 resolved TR flags on BOM rows (from the #199 T10 approve-sweep test); a review-notification email fired to jon@matrixpci.com; a BC quote_ready upload fired (sandbox). Reset if you demo/reuse this project.
- **PRJ402111 "Secret Panel"** — pending supplier submission CONSUMED (applied); ~7 BC ItemVendorCatalog sandbox writes; a manufactured cross (KXT1HTC-3→800H-QRH2G) reverted on reload (benign). Needs a fresh submission before re-running a supplier-cross test.
- No reset performed (test data, pre-launch) — logged only per Jon 2026-07-03. Related: G005 (matrix-arc-test shares PROD Firestore — isolate before real customers).

## Session infrastructure lessons (carry-forward)
- **Cross-session bus:** CCD Desktop↔Desktop only (Terminal can't receive). Each session in "Ask permissions" mode for outbound sends to fire. Allow-Once is per-send + hardcoded (above).
- **React controlled inputs can't be set by automation** — the TR checkbox needed Jon's real click; synthetic/ref clicks toggle the DOM box but React reverts (no onChange). Ref-clicking BUTTONS/dropdowns works fine. → live acceptance of checkbox-driven UI needs Jon co-driving the clicks.
- **Controlled-tab instability / Firestore reads / Fastly-edge:** unchanged from prior state (heavy in-page JS freezes the tab; read `companies/{cid}/…`; a prod load-failure may be a Fastly POP edge timeout, not ARC — confirm-and-wait, no redeploy).
