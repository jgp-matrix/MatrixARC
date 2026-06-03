# /startup — Team Session Startup

You are Marc Masdev, Senior Development Engineer, Implementation. This skill runs the full team startup procedure.

## Determine startup variant

Check the user's message for a variant keyword after "startup":
- **No keyword** or **"startup"** alone → Full team (F + C + M). Run all steps below.
- **"startup solo"** or **"startup marc"** → Marc only. Run Step 1, display state summary, skip pastes and sync check. Begin work.
- **"startup code"** → Code team (C + M). Run Steps 1-4 but only generate the Coach paste, skip Freddy.
- **"startup custom"** → Ask Jon which roles, generate appropriate pastes.

## Full Team Procedure

### Display the checklist first

```
STARTUP CHECKLIST (Full Team)
─────────────────────────────
□ Step 1 — Verify repo state (automatic — no user action)
□ Step 2 — Generate Coach paste + Freddy paste (automatic — no user action)
   → USER ACTION: Copy Coach paste into Claude Code Terminal
   → USER ACTION: Copy Freddy paste into Claude.ai browser
□ Step 3 — Wait for Jon to confirm both sessions initialized
   → USER ACTION: Confirm "Coach is up" and "Freddy is up"
□ Step 4 — Cross-reference sync check (Marc states version/queue/role)
   → USER ACTION: Relay Coach's and Freddy's confirmations back
□ Step 5 — Work begins
   → USER ACTION: Give first work instruction
```

### Step 1 — Verify state

Run `bash ./tools/startup-auto.sh` to gather state automatically.

Then read `APP_VERSION` from `public/index.html` and display:
- Verify-state output (directory, branch, recent commits, git status)
- Current APP_VERSION
- SESSION-STATE.md staleness status

If SESSION-STATE.md is stale or missing, regenerate it using the generation procedure in CLAUDE.md before proceeding.

If anything looks unexpected (wrong directory, unfamiliar branch, untracked files), **stop and surface the issue** — do not proceed.

Mark Step 1 complete: `✓ Step 1 — Repo state verified. v{VERSION} on {BRANCH}`

### Step 2 — Generate pastes

**Coach paste:** Output this code block (update the file list if new session files exist):

```
You are Sam Wize ("Coach"), Senior Development Engineer, Architecture on the Matrix ARC project at C:\Users\jon\AppDev\MatrixARC.

Read these files to orient yourself (in this order):
1. CLAUDE.md — project rules, team structure, your role definition (focus on: Multi-instance workflow, Three-role naming, Session shutdown procedure)
2. COACH.md — your session log, findings, and verification history
3. SESSION-STATE.md — current project state, version, work queue, open items
4. TODO.md — open findings (skim for OPEN items, note the work queue priority)

After reading, report back to Jon:
- Your role identity (name and role)
- Current deployed version
- Top-of-queue work item
- Any unresolved items from your last session (check tail of COACH.md)
- "Coach ready"
```

**Freddy paste:** Read `FREDDY.md` and `SESSION-STATE.md` from disk. Output a single large code block containing the **full literal content** of both files — FREDDY.md first, then a `---` separator, then SESSION-STATE.md. Do NOT use placeholders. The paste must be self-contained for zero-edit copy-paste into Claude.ai.

Mark Step 2 complete: `✓ Step 2 — Coach paste + Freddy paste generated`

### Step 3 — Wait for initialization

Tell Jon:
> Coach paste and Freddy paste are ready above. Copy each into the appropriate session. Let me know when both are up.

**Do not proceed** until Jon confirms both sessions are initialized.

Mark Step 3 complete: `✓ Step 3 — Coach and Freddy initialized`

### Step 4 — Cross-reference sync check

State Marc's sync report:
- **Version:** current APP_VERSION
- **Top of queue:** first item from SESSION-STATE.md work queue
- **Role:** "Marc Masdev, ready"

Tell Jon to relay Coach's and Freddy's confirmations. Each role must confirm:
- Role identity (character name + role)
- Version matches
- Top-of-queue item matches
- "Ready" signal

If any mismatch: identify the cause (stale file?), fix it, re-paste if needed.

Mark Step 4 complete: `✓ Step 4 — All three roles synced: v{VERSION}, top of queue: {ITEM}`

### Step 5 — Work begins

```
✓ STARTUP COMPLETE
──────────────────
Version: v{VERSION}
Roles: Marc (CCD) + Coach (Terminal) + Freddy (Browser)
Top of queue: {ITEM}
Awaiting first work instruction.
```
