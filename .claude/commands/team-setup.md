# /team-setup — Configure Your Dev Team

One-time setup wizard that creates `.claude/team-config.json`. Run this before using `/team-startup` or `/team-closeout`.

If `.claude/team-config.json` already exists, read it and ask: "Team config exists. Reconfigure from scratch, or edit specific fields?"

## Procedure

### Step 1 — Team Name

Ask: **"What do you want to call your team?"**
- Default: "Dev Team"
- Examples: "Matrix ARC Team", "Acme Backend Squad", "Platform Crew"

### Step 2 — Role Names

Explain the three roles, then ask for names:

```
Your team has three roles:

IMPLEMENTER — Writes code, deploys, boots first, orchestrates startup/closeout.
              This is the role running in YOUR current session.

ARCHITECT   — Reviews code, audits architecture, writes plans, verifies implementations.
              Runs in a separate Claude session with file access.

ANALYST     — Strategic analysis, briefs, design review. No direct file access.
              Runs in Claude.ai browser (or another session — see Step 3).
```

For each role, ask:
- **Full name** (used in formal attribution): Default "Marc Masdev" / "Sam Wize" / "Freddy Lyst"
- **Short name** (used in conversation): Default "Marc" / "Coach" / "Freddy"
- **Notification prefix** (for push notifications): Default "MARC" / "COACH" / "FREDDY"

### Step 3 — Environments

Ask which Claude environment runs each role:

```
Which Claude environment runs each role?

IMPLEMENTER (this session):
  a) Claude Code Desktop (CCD)
  b) Claude Code Terminal

ARCHITECT:
  a) Claude Code Desktop (CCD)
  b) Claude Code Terminal

ANALYST:
  a) Claude.ai (browser) — no file access, receives full inline paste
  b) Claude Code Terminal — has file access, receives file paths instead
  c) Claude Code Desktop — has file access, receives file paths instead
```

The analyst environment determines how the startup paste is generated:
- **Browser**: full inline content (ANALYST-ONBOARDING.md + SESSION-STATE.md pasted verbatim)
- **Terminal/CCD**: file paths to read (same format as Architect paste)

### Step 4 — Session Files

Explain the handoff files and ask for custom names or defaults:

```
The workflow uses these handoff files between sessions:

SESSION-STATE.md        — Auto-generated project state (version, commits, work queue)
{ANALYST}-ONBOARDING.md — Analyst startup context (role identity, project knowledge, protocols)
{ARCHITECT}-LOG.md      — Architect session log (findings, verifications, sign-offs)

Defaults based on your names:
  SESSION-STATE.md
  {analyst-short-name}-ONBOARDING.md  (e.g., FREDDY-ONBOARDING.md)
  {architect-short-name}-LOG.md       (e.g., COACH-LOG.md)

Use these defaults, or specify custom filenames?
```

### Step 5 — Write Config

Write `.claude/team-config.json` with the collected values:

```json
{
  "teamName": "{team name}",
  "roles": {
    "implementer": {
      "name": "{full name}",
      "shortName": "{short name}",
      "environment": "ccd|terminal",
      "notifyPrefix": "{PREFIX}"
    },
    "architect": {
      "name": "{full name}",
      "shortName": "{short name}",
      "environment": "ccd|terminal",
      "notifyPrefix": "{PREFIX}"
    },
    "analyst": {
      "name": "{full name}",
      "shortName": "{short name}",
      "environment": "browser|terminal|ccd",
      "notifyPrefix": "{PREFIX}",
      "hasFileAccess": false|true
    }
  },
  "files": {
    "sessionState": "SESSION-STATE.md",
    "analystOnboarding": "{filename}.md",
    "architectLog": "{filename}.md"
  }
}
```

Set `analyst.hasFileAccess` to `false` if environment is "browser", `true` otherwise.

### Step 6 — Confirm

Display the config summary:

```
TEAM CONFIGURED ✓
─────────────────
Team: {teamName}

Implementer: {name} ({shortName}) — {environment}
Architect:   {name} ({shortName}) — {environment}
Analyst:     {name} ({shortName}) — {environment}

Session files:
  {sessionState}
  {analystOnboarding}
  {architectLog}

Run /team-startup to boot the team.
```

### Step 7 — Create template files if missing

If the analyst onboarding file or architect log file don't exist yet, offer to create them from templates:

- **Analyst onboarding**: Create a template based on the structure in the existing FREDDY.md — role identity, working pattern, communication conventions, recently active work. Customize with the user's role names.
- **Architect log**: Create a blank log file with a header section.
- **SESSION-STATE.md**: Will be auto-generated on first `/team-startup`.

Ask: "Want me to create template files for {analyst onboarding} and {architect log}? I'll customize them with your team names."
