# /team-startup — Dev Team Session Startup

This skill boots the full dev team. The **Orchestrator** — the role configured in `orchestrator` — runs first (in the fresh session where the user types the command) and coordinates the others. Jon opens ONE new CCD session, types `/team-startup`, and that session becomes the Orchestrator.

**Interaction rule:** Whenever this skill requires a user decision (approval, choice, confirmation), use the AskUserQuestion tool with selectable options — never ask as plain text expecting a typed answer.

## Prerequisites

Read `.claude/team-config.json`. If it doesn't exist, tell the user to run `/team-setup` first and stop.

Extract these values from the config (use throughout this skill):
- `TEAM` = teamName
- `GUIDED` = guidedMode (if true, show tips; if false or missing, skip tips)
- `ORCH_ROLE` = orchestrator (role key: `implementer` | `architect` | `analyst`). **For the Matrix ARC team this is `analyst` (Freddy) — the PRIMARY session where Jon types `/team-startup` is ALWAYS Freddy, never a peer (Marc/Coach/Dez).** If the `orchestrator` field is somehow missing, default to **`analyst`** (NOT implementer) so the primary session still becomes Freddy. This is the role the current session adopts and runs startup as.
- For each role (`implementer`, `architect`, `analyst`, `intake`), read `.name` / `.shortName` / `.sessionTitle` / `.environment` / `.hasFileAccess`. Referenced below as `IMPL_*`, `ARCH_*`, `ANALYST_*`, `INTAKE_*` (e.g. `IMPL_NAME`, `INTAKE_TITLE`). If a `sessionTitle` is missing, fall back to a title containing that role's short name. (`intake` may be absent in older configs — skip it if the role key isn't present.)
- `ORCH_NAME` / `ORCH_SHORT` / `ORCH_TITLE` = the `.name` / `.shortName` / `.sessionTitle` of `roles[ORCH_ROLE]`.
- `PEERS` = **all roles that are not** `ORCH_ROLE` (with the analyst orchestrating, that's implementer + architect + intake — Marc, Coach, Dez). You generate one paste per peer (Step 2) and comms-check each peer (Step 5).
- `SESSION_STATE` = files.sessionState
- `ANALYST_ONBOARDING` = files.analystOnboarding
- `ANALYST_PASTE` = files.analystPaste (combined onboarding + session state, used only in the no-file-access fallback)
- `ARCH_LOG` = files.architectLog
- `APP_URL` = appUrl (the deployed app URL for the live-testing browser)

You are **{ORCH_NAME}** ("{ORCH_SHORT}"), running startup orchestration in the **primary CCD session** — the one where Jon typed `/team-startup`. Adopt this identity for the session. **The CCD agent cannot rename its own session, so ask Jon to rename THIS primary session to "{ORCH_TITLE}"** (Jon's Step 3 — the primary window must read `🟥Freddy - ARC`, never a peer name). Orchestration is a coordination duty — read-only state checks, generating the peer pastes, and running the comms check. It does **not** change {ORCH_SHORT}'s working lane (e.g. the analyst still reads-to-route during work; they don't build or trace).

**Guided mode:** If `GUIDED` is true, show the `💡 TIP` blocks below at each step. If the user says "stop handholding", "I got it", "skip tips", or similar at ANY point, set `guidedMode: false` in `.claude/team-config.json` and stop showing tips for the rest of this session and all future sessions.

## Display the checklist

List the peer short names — every role that isn't {ORCH_SHORT} (with the analyst orchestrating: Marc, Coach, Dez).

```
{TEAM} STARTUP CHECKLIST  (orchestrated by {ORCH_SHORT})
─────────────────────────────
□ Step 0 — This PRIMARY session is {ORCH_SHORT} (the orchestrator), NOT a peer
   → USER ACTION: rename this session to "{ORCH_TITLE}"
□ Step 1 — Verify repo state (automatic — no user action)
□ Step 2 — Generate a paste for EACH peer (automatic; path-based)
   → USER ACTION: Paste each block into a new CCD session for that role
□ Step 3 — Live-testing browser (linked in the Implementer's session)
□ Step 4 — Wait for user to confirm ALL peer sessions initialized
   → USER ACTION: Confirm each peer is up
□ Step 5 — Comms-check sync ({ORCH_SHORT} messages every peer via send_message; they reply on the bus)
   → USER ACTION: Approve the per-send "Allow Once" prompts — no manual relay needed
□ Step 6 — Work begins
   → USER ACTION: Give first work instruction
```

## Step 1 — Verify state

**Guided tip (only if GUIDED):**
```
💡 TIP: This step makes sure the repo is in a known-good state before the
team boots. It checks: correct directory, expected branch, clean working tree,
and whether the session state file needs regenerating. If anything is off,
we stop here so you can fix it before the other roles get stale context.
```

Run `bash ./tools/startup-auto.sh` to gather state. ({ORCH_SHORT} has repo file access, so this runs in the orchestrator session directly.)

Also read the project's version constant (e.g., `APP_VERSION` from `public/index.html` or equivalent) and display:
- Verify-state output (directory, branch, recent commits, git status)
- Current version
- SESSION-STATE staleness status

If {SESSION_STATE} is stale or missing, regenerate it before proceeding.

If anything looks unexpected (wrong directory, unfamiliar branch, untracked files), **stop and surface the issue**.

Mark complete: `✓ Step 1 — Repo state verified. v{VERSION} on {BRANCH}`

## Step 2 — Generate peer pastes

**Guided tip (only if GUIDED):**
```
💡 TIP: You'll get one code block per teammate that isn't me. Open a new CCD
session for each, name it, and paste the block. They read their context files
and report back. All roles have repo access now, so these are path-based
pastes — no drag-and-drop files.
```

Emit one path-based paste **for each peer role** (every role except {ORCH_SHORT}). Use the matching template below; skip the template for {ORCH_ROLE}. Each paste's first line ASKS the session to self-title — but **in CCD the agent usually cannot set its own session name**, so tell Jon to **set each session's title manually** (rename it to the role's `sessionTitle`) after pasting. Confirm titles are set before the Step 5 comms-check; if one wasn't, locate that peer by elimination in `list_sessions` (the ids of the already-known sessions rule themselves out, leaving the new/renamed one).

**Implementer paste** (emit if implementer is a peer):

```
Set this session's name to "{IMPL_TITLE}".

You are {IMPL_NAME} ("{IMPL_SHORT}"), Developer/Implementer on the {TEAM} project at {repo root path}.

Read these files to orient yourself (in this order):
1. CLAUDE.md — project rules, team structure, your role definition
2. {SESSION_STATE} — current project state, version, work queue, open items
3. TODO.md — open findings (skim for OPEN items, note the work queue priority)

You own live testing. If a live browser is needed, open {APP_URL} in a linked Claude-in-Chrome tab IN THIS SESSION (browser MCP control is session-bound — it must be your session, not the orchestrator's), then stamp the tab title: document.title = '🤖 CLAUDE-CONTROLLED ▸ ARC'; (re-stamp after any reload). See CLAUDE.md → "Mark the Claude-controlled browser tab."

Stay in "Ask permissions" mode so your cross-session send_message replies fire.

After reading, report back:
- Your role identity (name and role)
- Current deployed version + live master tip (git rev-parse --short HEAD)
- Top-of-queue work item
- Whether the live-testing tab is linked (or "not needed yet")
- "{IMPL_SHORT} ready"
```

**Architect paste** (emit if architect is a peer):

```
Set this session's name to "{ARCH_TITLE}".

You are {ARCH_NAME} ("{ARCH_SHORT}"), Senior Development Engineer, Architecture on the {TEAM} project at {repo root path}.

Read these files to orient yourself (in this order):
1. CLAUDE.md — project rules, team structure, your role definition
2. {ARCH_LOG} — your session log, findings, and verification history
3. {SESSION_STATE} — current project state, version, work queue, open items
4. TODO.md — open findings (skim for OPEN items, note the work queue priority)

Stay in "Ask permissions" mode so your cross-session send_message replies fire.

After reading, report back:
- Your role identity (name and role)
- Current deployed version + live master tip (git rev-parse --short HEAD)
- Top-of-queue work item
- Any unresolved items from your last session (check tail of {ARCH_LOG})
- "{ARCH_SHORT} ready"
```

**Analyst paste** (emit if analyst is a peer — i.e. NOT the orchestrator):

If `ANALYST_HAS_FILES` is true (CCD/repo access), emit the path-based block:

```
Set this session's name to "{ANALYST_TITLE}".

You are {ANALYST_NAME} ("{ANALYST_SHORT}"), Senior Analyst on the {TEAM} project at {repo root path}.

Read these files to orient yourself (in this order):
1. {ANALYST_ONBOARDING} — your role identity, project knowledge, protocols
2. {SESSION_STATE} — current project state, version, work queue
3. TODO.md — open findings (skim for context)

Stay in "Ask permissions" mode so your cross-session send_message replies fire.

After reading, report back:
- Your role identity (name and role)
- Current deployed version + live master tip (git rev-parse --short HEAD)
- Top-of-queue work item
- "{ANALYST_SHORT} ready"
```

If `ANALYST_HAS_FILES` is false (browser, no repo access), fall back to the drag-file method instead: open Explorer with `{ANALYST_PASTE}` and `TODO.md` pre-selected and tell the user to drag BOTH into Claude.ai.
```powershell
Start-Process explorer.exe -ArgumentList "/select,{repo root path}\{ANALYST_PASTE}"
Start-Process explorer.exe -ArgumentList "/select,{repo root path}\TODO.md"
```

**Intake paste** (emit if intake is a peer — Dez):

```
Set this session's name to "{INTAKE_TITLE}".

You are {INTAKE_NAME} ("{INTAKE_SHORT}"), Intake/Triage + live Status Board on the {TEAM} project at {repo root path}.

Read these files to orient yourself (in this order):
1. CLAUDE.md — project rules + your role (the Intake/Triage subsection + the Status Board duty)
2. INBOX.md — the intake capture file you own (append-only)
3. STATUS.md — the live status board you own (sole writer)
4. {SESSION_STATE} — current project state, version, work queue

You OWN INBOX.md (append-only bug/feature capture — commit `-- INBOX.md` + push after each) and STATUS.md (sole writer). You CAPTURE + DISPLAY only — never scope, assign, or build (Freddy triages the INBOX + routes the status content). Stay in "Ask permissions" mode so your cross-session send_message replies fire.

After reading, report back:
- Your role identity (name and role)
- Current deployed version + live master tip (git rev-parse --short HEAD)
- That INBOX.md + STATUS.md are current (or note pending items)
- "{INTAKE_SHORT} ready"
```

Mark complete: `✓ Step 2 — pastes ready for every peer`

## Step 3 — Live-testing browser

The live-testing browser tab is owned by the **Implementer** ({IMPL_SHORT}), because that role runs live verification and Claude-in-Chrome control is bound to the session that opens the tab.

- **If {ORCH_ROLE} is the implementer:** open the tab here now — `tabs_context_mcp {createIfEmpty:true}` → `tabs_create_mcp` → navigate to `{APP_URL}` → screenshot → stamp `document.title = '🤖 CLAUDE-CONTROLLED ▸ ARC';`. Re-stamp after any reload.
- **Otherwise (orchestrator is the architect or analyst):** do NOT open it here. The Implementer paste (Step 2) already instructs {IMPL_SHORT} to link + stamp the tab in their own session. Confirmation arrives when {IMPL_SHORT} reports "tab linked" in the Step 5 comms check.

Refer to it as "the Claude-controlled tab," never the raw numeric id.

Mark complete: `✓ Step 3 — Live-testing browser owned by {IMPL_SHORT}` (linked here, or delegated to {IMPL_SHORT})

## Step 4 — Wait for initialization

**Guided tip (only if GUIDED):**
```
💡 TIP: Open a new CCD session for each teammate that isn't me, paste their
block, and name the session. They'll read context and report back. Come back
here and tell me when both are up.
```

Tell the user:
> A paste is ready above for each peer. Open a **new CCD (Claude Code Desktop) session for each** and paste their block in. Each paste self-titles the session (first line) so my Step 5 comms check can locate it via `list_sessions`. Let me know when all are up.

**All team roles run in CCD (Desktop)**, so cross-session `send_message` moves messages between them directly (no copy-paste relay). Each session must be in **"Ask permissions"** mode for its outbound sends to fire; a per-send **"Allow Once"** prompt is expected (hardcoded, not suppressible). Do NOT use the Terminal CLI for any team role — it cannot receive cross-session messages; the repo (git) remains the durable fallback bus.

**Do not proceed** until the user confirms all peer sessions are initialized.

Mark complete: `✓ Step 4 — all peers initialized (CCD)`

## Step 5 — Comms-check sync (automated, over the CCD bus)

{ORCH_SHORT} runs the sync check directly over the cross-session messaging bus — **no manual relay from the user.** This simultaneously verifies (a) the three-way `send_message` bus is live in both directions and (b) all roles agree on version, queue, and master tip.

**Guided tip (only if GUIDED):**
```
💡 TIP: Instead of you copying each role's report back to me, I message the two
other roles directly over the CCD bus and they reply on it. You'll just approve
an "Allow Once" prompt per send. If anyone reports a mismatch (version, queue,
or master tip SHA), it usually means a handoff file is stale — we fix it before
starting work.
```

1. **Locate the peer sessions.** Call `list_sessions` and match each peer by its self-title (its `sessionTitle`). If a title isn't found or is ambiguous (e.g. duplicates), ask the user which sessionId is which before sending — never guess the target.

2. **State {ORCH_SHORT}'s own sync baseline** so the reply comparison has a reference:
   - **Version:** current version
   - **Master tip:** `git rev-parse --short HEAD` (must equal `origin/master`)
   - **Top of queue:** first item from {SESSION_STATE} work queue
   - **Role:** "{ORCH_NAME}, ready"

3. **Send a comms-check message to each peer** via `send_message` (both sends can go in one turn; each triggers an "Allow Once" prompt the user approves). Ask each to reply **on the bus** (via `send_message` back to {ORCH_SHORT}) with:
   - Their role identity (character name + role)
   - The deployed version they see
   - Their **live** master tip (`git rev-parse --short HEAD`, not a value copied from a handoff file)
   - Their top-of-queue read
   - A "{short name} comms OK" signal
   - (Implementer only) whether the live-testing tab is linked

4. **Wait for both replies** to arrive as cross-session messages, then verify each field against {ORCH_SHORT}'s baseline:
   - Role identity correct
   - Version matches
   - **Master tip SHA matches** ← this leg catches stale-handoff drift (a role reporting an old SHA read from a file instead of live git)
   - Top-of-queue item matches
   - "comms OK" received (proves the bus works both directions)

5. **On any mismatch:** identify the cause (stale handoff file citing an old version/SHA is the usual culprit), have the affected role re-verify against live git, fix the stale file so the next boot doesn't repeat it, and re-run the check for that role.

If a peer's session can't be reached over the bus (no reply, or it's a Terminal CLI session which can't receive messages), fall back to asking the user to relay that one role's confirmation manually, and flag that the role isn't on the bus.

Mark complete: `✓ Step 5 — All roles synced over the bus: v{VERSION} @ {SHA}, top of queue: {ITEM}`

## Step 6 — Work begins

```
✓ {TEAM} STARTUP COMPLETE
──────────────────────────
Version: v{VERSION} @ {SHA}
Orchestrated by: {ORCH_SHORT}
Roles: {IMPL_SHORT} + {ARCH_SHORT} + {ANALYST_SHORT} + {INTAKE_SHORT} (all CCD)
Live-testing browser: {linked in IMPL_SHORT's session | not yet needed}
Top of queue: {ITEM}
Awaiting first work instruction.
```

## Standing duty during the session — feed {INTAKE_SHORT}'s Status Board

{INTAKE_SHORT} (Intake) runs the live **Status Board** (`STATUS.md`, {INTAKE_SHORT} sole writer) — the glanceable "who's doing what right now" for Jon. The board only stays current if **{ORCH_SHORT} (hub) pings {INTAKE_SHORT} the status content**; {INTAKE_SHORT} captures/displays, never scopes. **This is easy to forget — do not.**

**Cadence — ping {INTAKE_SHORT} at every milestone / phase boundary**, NOT every micro-step (respect the minimize-sends rule — each send is an Allow-Once prompt). Fire a status ping when:
- an item **ships / deploys**, changes **status** (Backlog→Building→Verified), or is **blocked/unblocked**;
- a **phase** starts or finishes (plan→build→verify→deploy);
- a **decision is pending with Jon** (so the board shows what's waiting on him);
- **who's-doing-what** changes (a role picks up / finishes / goes idle).

Each ping = a short glanceable snapshot: current item states + who's on what right now + the next Jon touchpoint. Batch related changes into one ping. ({INTAKE_SHORT}'s side of this is in CLAUDE.md → Intake/Triage; this is the {ORCH_SHORT}-side reminder that was missing.)

## ★ AWAY MODE — when Jon steps away (unattended coordination, ZERO sends)

**The problem:** every cross-session `send_message` needs Jon's per-send "Allow Once" click (hardcoded, unsuppressible — G001, re-confirmed incl. Bypass Permissions). So the instant Jon steps away, any send **stalls** waiting for a click that won't come. This bit us live (2026-07-06 lunch: Marc's "report results" send + {ORCH_SHORT}'s status pings all blocked). **Do not repeat it.**

**Trigger:** Jon says he's stepping away — "lunch", "afk", "leaving", "back in N", etc. {ORCH_SHORT} declares **AWAY MODE** and adopts BOTH levers (Jon ruled "both", 2026-07-06):

**Lever 1 — pull-based repo bus (standing 4-session team).** The key insight: tasks are already assigned; only cross-session *reporting* stalls. So during away mode:
- **{ORCH_SHORT} assigns/confirms each active role's task BEFORE Jon leaves** (no inbound sends needed during the away window).
- Roles **do NOT `send_message`.** Each role finishes its assigned task and **commits its output + a one-line status to a file it owns** (results doc / its status file) and pushes. A mid-task blocker → commit a `BLOCKED: <what>` note + work parallel paths or hold; never send (it would stall).
- {ORCH_SHORT} **`git pull`s** to see progress (pulling needs no approval) — on Jon's return, and periodically if useful. Resume normal send-based coordination only once Jon's back to click.

**Lever 2 — in-session subagents for hands-off multi-step runs.** For a task Jon wants to *just run* unattended, {ORCH_SHORT} drives **in-session subagents** (Agent/Task tool) — they run inside the orchestrator session with **no cross-session prompts at all**. Jon **pre-authorizes** the run before leaving (subagent spawning stays hub-only + Jon-gated per the hybrid-routing guardrails); all subagent activity logs to STATUS.md/TODO.md. Ephemeral + orchestrator-framed cross-check — fine for mechanical/low-stakes autonomy; keep high-stakes independent review for when Jon's back.

**On return:** {ORCH_SHORT} pulls, reads the committed results / subagent output, updates Jon + feeds {INTAKE_SHORT}'s board, and normal send-based flow resumes.

> **Considered + rejected (2026-07-06): a "polling file-bus"** — each session self-wakes on a timer to pull + check an instruction file (approval-free, since a self-wake isn't a send and git/file ops are allowlist-suppressible). A *push* "check the files" message can't be free (the send itself is the toll, regardless of content). Polling works but adds token-burn (continuous idle ticks) + latency + loop-lifecycle risk, and full autonomous back-and-forth just hand-rolls what **subagents/Workflow already do natively**. Jon ruled: **use subagents for unattended autonomy; do NOT build a polling bus** (revisit only for a browser-dependent unattended need, since subagents can't hold Marc's persistent tab).
