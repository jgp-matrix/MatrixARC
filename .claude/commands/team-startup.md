# /team-startup — Dev Team Session Startup

This skill boots the full dev team. The Implementer (you) runs first and orchestrates.

## Prerequisites

Read `.claude/team-config.json`. If it doesn't exist, tell the user to run `/team-setup` first and stop.

Extract these values from the config (use throughout this skill):
- `TEAM` = teamName
- `IMPL_NAME` / `IMPL_SHORT` = roles.implementer.name / shortName
- `ARCH_NAME` / `ARCH_SHORT` = roles.architect.name / shortName
- `ANALYST_NAME` / `ANALYST_SHORT` = roles.analyst.name / shortName
- `ARCH_ENV` = roles.architect.environment
- `ANALYST_ENV` = roles.analyst.environment
- `ANALYST_HAS_FILES` = roles.analyst.hasFileAccess
- `SESSION_STATE` = files.sessionState
- `ANALYST_ONBOARDING` = files.analystOnboarding
- `ARCH_LOG` = files.architectLog

You are **{IMPL_NAME}** ("{IMPL_SHORT}"). Adopt this identity for the session.

## Display the checklist

```
{TEAM} STARTUP CHECKLIST
─────────────────────────────
□ Step 1 — Verify repo state (automatic — no user action)
□ Step 2 — Generate {ARCH_SHORT} paste + {ANALYST_SHORT} paste (automatic)
   → USER ACTION: Copy {ARCH_SHORT} paste into {ARCH_ENV}
   → USER ACTION: Copy {ANALYST_SHORT} paste into {ANALYST_ENV}
□ Step 3 — Wait for user to confirm both sessions initialized
   → USER ACTION: Confirm "{ARCH_SHORT} is up" and "{ANALYST_SHORT} is up"
□ Step 4 — Cross-reference sync check ({IMPL_SHORT} states version/queue/role)
   → USER ACTION: Relay {ARCH_SHORT}'s and {ANALYST_SHORT}'s confirmations back
□ Step 5 — Work begins
   → USER ACTION: Give first work instruction
```

## Step 1 — Verify state

Run `bash ./tools/startup-auto.sh` to gather state.

Also read the project's version constant (e.g., `APP_VERSION` from `public/index.html` or equivalent) and display:
- Verify-state output (directory, branch, recent commits, git status)
- Current version
- SESSION-STATE staleness status

If {SESSION_STATE} is stale or missing, regenerate it before proceeding.

If anything looks unexpected (wrong directory, unfamiliar branch, untracked files), **stop and surface the issue**.

Mark complete: `✓ Step 1 — Repo state verified. v{VERSION} on {BRANCH}`

## Step 2 — Generate pastes

### Architect paste (for {ARCH_ENV})

The Architect has file access. Output a code block with file paths and orientation instructions:

```
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

### Analyst paste (for {ANALYST_ENV})

**If ANALYST_HAS_FILES is false (browser):**
Read `{ANALYST_ONBOARDING}` and `{SESSION_STATE}` from disk. Output a single large code block containing the **full literal content** of both files — onboarding file first, then a `---` separator, then session state. Do NOT use placeholders. The paste must be self-contained for zero-edit copy-paste.

**If ANALYST_HAS_FILES is true (terminal/CCD):**
Output a code block with file paths, same format as the Architect paste:

```
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

Mark complete: `✓ Step 2 — {ARCH_SHORT} paste + {ANALYST_SHORT} paste generated`

## Step 3 — Wait for initialization

Tell the user:
> Pastes are ready above. Copy each into the appropriate session. Let me know when both are up.

**Do not proceed** until user confirms both sessions are initialized.

Mark complete: `✓ Step 3 — {ARCH_SHORT} and {ANALYST_SHORT} initialized`

## Step 4 — Cross-reference sync check

State the Implementer's sync report:
- **Version:** current version
- **Top of queue:** first item from {SESSION_STATE} work queue
- **Role:** "{IMPL_NAME}, ready"

Ask user to relay the other roles' confirmations. Each must confirm:
- Role identity (character name + role)
- Version matches
- Top-of-queue item matches
- "Ready" signal

If any mismatch: identify cause (stale file?), fix, re-paste if needed.

Mark complete: `✓ Step 4 — All three roles synced: v{VERSION}, top of queue: {ITEM}`

## Step 5 — Work begins

```
✓ {TEAM} STARTUP COMPLETE
──────────────────────────
Version: v{VERSION}
Roles: {IMPL_SHORT} ({IMPL_ENV}) + {ARCH_SHORT} ({ARCH_ENV}) + {ANALYST_SHORT} ({ANALYST_ENV})
Top of queue: {ITEM}
Awaiting first work instruction.
```
