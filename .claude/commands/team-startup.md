# /team-startup — Dev Team Session Startup

This skill boots the full dev team. The Implementer (you) runs first and orchestrates.

**Interaction rule:** Whenever this skill requires a user decision (approval, choice, confirmation), use the AskUserQuestion tool with selectable options — never ask as plain text expecting a typed answer.

## Prerequisites

Read `.claude/team-config.json`. If it doesn't exist, tell the user to run `/team-setup` first and stop.

Extract these values from the config (use throughout this skill):
- `TEAM` = teamName
- `GUIDED` = guidedMode (if true, show tips; if false or missing, skip tips)
- `IMPL_NAME` / `IMPL_SHORT` / `IMPL_TITLE` = roles.implementer.name / shortName / sessionTitle
- `ARCH_NAME` / `ARCH_SHORT` / `ARCH_TITLE` = roles.architect.name / shortName / sessionTitle
- `ANALYST_NAME` / `ANALYST_SHORT` / `ANALYST_TITLE` = roles.analyst.name / shortName / sessionTitle
  (if a `sessionTitle` is missing, fall back to a title containing the role short name)
- `ARCH_ENV` = roles.architect.environment
- `ANALYST_ENV` = roles.analyst.environment
- `ANALYST_HAS_FILES` = roles.analyst.hasFileAccess
- `SESSION_STATE` = files.sessionState
- `ANALYST_ONBOARDING` = files.analystOnboarding
- `ANALYST_PASTE` = files.analystPaste (combined onboarding + session state file for drag-and-drop)
- `ARCH_LOG` = files.architectLog
- `APP_URL` = appUrl (the deployed app URL to open in browser)

You are **{IMPL_NAME}** ("{IMPL_SHORT}"). Adopt this identity for the session.

**Guided mode:** If `GUIDED` is true, show the `💡 TIP` blocks below at each step. If the user says "stop handholding", "I got it", "skip tips", or similar at ANY point, set `guidedMode: false` in `.claude/team-config.json` and stop showing tips for the rest of this session and all future sessions.

## Display the checklist

```
{TEAM} STARTUP CHECKLIST
─────────────────────────────
□ Step 1 — Verify repo state (automatic — no user action)
□ Step 2 — Generate {ARCH_SHORT} + {ANALYST_SHORT} pastes (automatic; both CCD, path-based)
   → USER ACTION: Paste {ARCH_SHORT} block into a new {ARCH_SHORT} CCD session
   → USER ACTION: Paste {ANALYST_SHORT} block into a new {ANALYST_SHORT} CCD session
□ Step 3 — Open app in browser + link to CCD (automatic)
□ Step 4 — Wait for user to confirm both sessions initialized
   → USER ACTION: Confirm "{ARCH_SHORT} is up" and "{ANALYST_SHORT} is up"
□ Step 5 — Comms-check sync ({IMPL_SHORT} messages both roles via send_message; they reply on the bus)
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

Run `bash ./tools/startup-auto.sh` to gather state.

Also read the project's version constant (e.g., `APP_VERSION` from `public/index.html` or equivalent) and display:
- Verify-state output (directory, branch, recent commits, git status)
- Current version
- SESSION-STATE staleness status

If {SESSION_STATE} is stale or missing, regenerate it before proceeding.

If anything looks unexpected (wrong directory, unfamiliar branch, untracked files), **stop and surface the issue**.

Mark complete: `✓ Step 1 — Repo state verified. v{VERSION} on {BRANCH}`

## Step 2 — Generate pastes

**Guided tip (only if GUIDED):**
```
💡 TIP: You'll see two code blocks below. The Architect gets a paste to
copy into their terminal. The Analyst gets a drag-and-drop file — just
drag it into the Claude.ai browser window. Much faster than pasting.
```

### Architect paste (for {ARCH_ENV})

The Architect has file access. Output a code block with file paths and orientation instructions:

```
Set this session's name to "{ARCH_TITLE}".

You are {ARCH_NAME} ("{ARCH_SHORT}"), Senior Development Engineer, Architecture on the {TEAM} project at {repo root path}.

Read these files to orient yourself (in this order):
1. CLAUDE.md — project rules, team structure, your role definition
2. {ARCH_LOG} — your session log, findings, and verification history
3. {SESSION_STATE} — current project state, version, work queue, open items
4. TODO.md — open findings (skim for OPEN items, note the work queue priority)

After reading, report back:
- Your role identity (name and role)
- Current deployed version
- Top-of-queue work item
- Any unresolved items from your last session (check tail of {ARCH_LOG})
- "{ARCH_SHORT} ready"
```

### Analyst file (for {ANALYST_ENV})

**If ANALYST_HAS_FILES is false (browser):**

The analyst paste file `{ANALYST_PASTE}` combines `{ANALYST_ONBOARDING}` + `{SESSION_STATE}` into a single file. It was last regenerated during the previous session's close out. No freshness check needed — it's only used at startup and close out keeps it current.

Open Explorer with the file pre-selected so the user can drag it directly into Claude.ai. Open a second Explorer selection for `TODO.md` so {ANALYST_SHORT} also gets the full findings log (the analyst has no repo access — SESSION-STATE.md only carries a queue summary):
```powershell
Start-Process explorer.exe -ArgumentList "/select,{repo root path}\{ANALYST_PASTE}"
Start-Process explorer.exe -ArgumentList "/select,{repo root path}\TODO.md"
```

Tell the user:
> **{ANALYST_SHORT} files:** Explorer opened with `{ANALYST_PASTE}` and `TODO.md` selected — drag BOTH into Claude.ai.

**If ANALYST_HAS_FILES is true (terminal/CCD):**
Output a code block with file paths, same format as the Architect paste:

```
Set this session's name to "{ANALYST_TITLE}".

You are {ANALYST_NAME} ("{ANALYST_SHORT}"), Senior Analyst on the {TEAM} project at {repo root path}.

Read these files to orient yourself (in this order):
1. {ANALYST_ONBOARDING} — your role identity, project knowledge, protocols
2. {SESSION_STATE} — current project state, version, work queue
3. TODO.md — open findings (skim for context)

After reading, report back:
- Your role identity (name and role)
- Current deployed version
- Top-of-queue work item
- "{ANALYST_SHORT} ready"
```

Mark complete: `✓ Step 2 — {ARCH_SHORT} paste + {ANALYST_SHORT} file ready`

## Step 3 — Open app in browser

If `APP_URL` is set in the config, open it in a linked browser session so {IMPL_SHORT} has a live view of the deployed app:

1. Use `tabs_context_mcp` (with `createIfEmpty: true`) to get or create the MCP tab group.
2. Create a new tab with `tabs_create_mcp`.
3. Navigate to `{APP_URL}` in the new tab.
4. Take a screenshot to confirm the app loaded.
5. **Stamp the controlled tab's title** so the user can identify it among duplicate tabs: run `document.title = '🤖 CLAUDE-CONTROLLED ▸ ARC';` via the browser JS tool. Re-stamp after any reload/navigation (the app resets the title on load). See CLAUDE.md → "Mark the Claude-controlled browser tab."

This tab becomes the linked browser session for live testing during the work session. All browser-based verification, runtime investigation, and UI testing should use this tab group. Refer to it as "the Claude-controlled tab," not the raw numeric id.

Mark complete: `✓ Step 3 — App opened at {APP_URL}, browser linked`

## Step 4 — Wait for initialization

**Guided tip (only if GUIDED):**
```
💡 TIP: Open two new Claude sessions now — one for the Architect, one for
the Analyst. Paste the blocks from Step 2 into each. They'll read the
context and report back. Come back here and tell me when both are ready.
```

Tell the user:
> {ARCH_SHORT} paste + {ANALYST_SHORT} paste are ready above. Open a **new CCD (Claude Code Desktop) session for each** ({ARCH_SHORT} and {ANALYST_SHORT}) and paste their block in. Both have repo access (paths, not drag files). **Name each session so it's identifiable in the session list** — include the role short name (e.g. a title containing "{ARCH_SHORT}" and one containing "{ANALYST_SHORT}"); {IMPL_SHORT}'s Step 5 comms check locates them by title via `list_sessions`. Let me know when both are up.

The paste blocks in Step 2 already include a first-line "Set this session's name to …" instruction so each role self-titles on boot.

**All three roles run in CCD (Desktop)** — Marc, {ARCH_SHORT}, {ANALYST_SHORT} — so cross-session `send_message` comms work between them (efficient message-moving, no copy-paste relay). Each session must be in **"Ask permissions"** mode for its outbound sends to fire; a per-send **"Allow Once"** prompt is expected (hardcoded, not suppressible). Do NOT use the Terminal CLI for any team role — it cannot receive cross-session messages; the repo (git) remains the durable fallback bus.

**Do not proceed** until user confirms both sessions are initialized.

Mark complete: `✓ Step 4 — {ARCH_SHORT} and {ANALYST_SHORT} initialized (both CCD)`

## Step 5 — Comms-check sync (automated, over the CCD bus)

{IMPL_SHORT} runs the sync check directly over the cross-session messaging bus — **no manual relay from the user.** This simultaneously verifies (a) the three-way `send_message` bus is live in both directions and (b) all three roles agree on version, queue, and master tip.

**Guided tip (only if GUIDED):**
```
💡 TIP: Instead of you copying each role's report back to me, I now message
{ARCH_SHORT} and {ANALYST_SHORT} directly over the CCD bus and they reply on it.
You'll just approve an "Allow Once" prompt per send. If anyone reports a
mismatch (version, queue, or master tip SHA), it usually means a handoff file
is stale — we fix it before starting work.
```

1. **Locate the target sessions.** Call `list_sessions` and match the Architect and Analyst sessions by title (they self-titled to `{ARCH_TITLE}` / `{ANALYST_TITLE}` on boot, per the Step 2 pastes). If a title isn't found or is ambiguous (e.g. duplicates), ask the user which sessionId is which before sending — never guess the target.

2. **State {IMPL_SHORT}'s own sync baseline** so the reply comparison has a reference:
   - **Version:** current version
   - **Master tip:** `git rev-parse --short HEAD` (must equal `origin/master`)
   - **Top of queue:** first item from {SESSION_STATE} work queue
   - **Role:** "{IMPL_NAME}, ready"

3. **Send a comms-check message to each role** via `send_message` (both sends can go in one turn; each triggers an "Allow Once" prompt the user approves). Ask each to reply **on the bus** (via `send_message` back to {IMPL_SHORT}) with:
   - Their role identity (character name + role)
   - The deployed version they see
   - Their **live** master tip (`git rev-parse --short HEAD`, not a value copied from a handoff file)
   - Their top-of-queue read
   - A "{short name} comms OK" signal

4. **Wait for both replies** to arrive as cross-session messages, then verify each field against {IMPL_SHORT}'s baseline:
   - Role identity correct
   - Version matches
   - **Master tip SHA matches** ← this leg catches stale-handoff drift (a role reporting an old SHA read from a file instead of live git)
   - Top-of-queue item matches
   - "comms OK" received (proves the bus works both directions)

5. **On any mismatch:** identify the cause (stale handoff file citing an old version/SHA is the usual culprit), have the affected role re-verify against live git, fix the stale file so the next boot doesn't repeat it, and re-run the check for that role.

If a role's session can't be reached over the bus (no reply, or it's a Terminal CLI session which can't receive messages), fall back to asking the user to relay that one role's confirmation manually, and flag that the role isn't on the bus.

Mark complete: `✓ Step 5 — All three roles synced over the bus: v{VERSION} @ {SHA}, top of queue: {ITEM}`

## Step 6 — Work begins

```
✓ {TEAM} STARTUP COMPLETE
──────────────────────────
Version: v{VERSION}
Roles: {IMPL_SHORT} ({IMPL_ENV}) + {ARCH_SHORT} ({ARCH_ENV}) + {ANALYST_SHORT} ({ANALYST_ENV})
Browser: linked to {APP_URL}
Top of queue: {ITEM}
Awaiting first work instruction.
```
