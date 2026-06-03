# /team-setup — Configure Your Dev Team

One-time setup wizard that creates `.claude/team-config.json`. Run this before using `/team-startup` or `/team-closeout`.

**Interaction rule:** Whenever this skill requires a user decision (approval, choice, confirmation), use the AskUserQuestion tool with selectable options — never ask as plain text expecting a typed answer.

If `.claude/team-config.json` already exists, read it and ask: "Team config exists. Reconfigure from scratch, or edit specific fields?"

## Guided Mode

At the start of setup, ask the user:

```
WELCOME TO DEV TEAM SETUP
──────────────────────────
This wizard configures a 3-role Claude dev team workflow:
  • An Implementer (writes code, deploys)
  • An Architect (reviews, plans, audits)
  • An Analyst (strategic analysis, briefs)

Each role runs in its own Claude session. The Implementer
(this session) orchestrates startup and closeout.

Would you like guided mode? (recommended for first-time setup)
  a) Guided — explains each step with tips and examples
  b) Quick — just the questions, no explanations
```

Write the user's choice to the config as `"guidedMode": true|false`.

**Guided mode behavior:**
- Before each step, display a `💡 TIP` block explaining WHY this step matters and HOW it affects the workflow.
- After setup completes, display a "What's Next" walkthrough.
- Guided mode carries into `/team-startup` and `/team-closeout` — those skills check the config flag and show help tips at each step on first use.
- At any point during startup or closeout, if the user says "stop handholding", "I got it", "skip tips", or similar, set `guidedMode: false` in the config and stop showing tips for the rest of the session and all future sessions.

## Procedure

### Step 1 — Team Name

**Guided tip (only if guidedMode):**
```
💡 TIP: The team name appears in checklists and completion banners.
Pick something that identifies your project or group.
```

Ask: **"What do you want to call your team?"**
- Default: "Dev Team"
- Examples: "Acme Backend Squad", "Platform Crew", "Widget App Team"

### Step 2 — Role Names

**Guided tip (only if guidedMode):**
```
💡 TIP: Each role gets a character name — a persona the Claude session
adopts. This helps the human facilitator (you) keep track of who said what
when copy-pasting between sessions. The short name is used in conversation,
the full name in formal documents. The notification prefix tags push
notifications so you know which session is pinging you.

You can use the defaults or pick names that fit your team culture.
```

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

**Guided tip (only if guidedMode):**
```
💡 TIP: The environment determines how each role receives context:
  • Claude Code Desktop / Terminal = has file access. Gets file paths to read.
  • Claude.ai (browser) = no file access. Gets the FULL content pasted inline.

The Analyst is typically in Claude.ai browser because that role doesn't need
to read code — it does strategic analysis. But if you prefer all three in
terminal/desktop, that works too.

The Implementer is always this session (where you're running setup now).
```

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
  a) Claude.ai browser (recommended) — no file access, full inline paste
  b) Claude Code Terminal — has file access, receives file paths
  c) Claude Code Desktop — has file access, receives file paths

⚠ RECOMMENDATION: Use Claude.ai (browser) for the Analyst.
  The Analyst deliberately has NO direct file access. This
  separation provides an unbiased third-party perspective —
  the Analyst questions assumptions and analyzes strategy
  without anchoring on implementation details. If the Analyst
  can read the code, they tend to confirm what the code says
  rather than challenge whether it's the right approach.
```

The analyst environment determines how the startup paste is generated:
- **Browser (recommended)**: full inline content (onboarding file + session state pasted verbatim). Analyst sees only what the Implementer explicitly shares.
- **Terminal/CCD**: file paths to read (same format as Architect paste). Analyst can explore the codebase independently — useful but sacrifices the third-party separation benefit.

### Step 4 — Session Files

**Guided tip (only if guidedMode):**
```
💡 TIP: These files are the "handoff" between sessions. When a session ends,
the Implementer updates them. When a new session starts, each role reads
them to pick up where the last session left off.

  • Session State — auto-generated snapshot: version, commits, work queue
  • Analyst Onboarding — the Analyst's "who am I and what's happening" doc
  • Architect Log — running record of findings, reviews, and sign-offs

The defaults are fine for most teams. Custom names help if you want them
to match your project naming conventions.
```

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
  "guidedMode": true|false,
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
Guided mode: {on/off}

Implementer: {name} ({shortName}) — {environment}
Architect:   {name} ({shortName}) — {environment}
Analyst:     {name} ({shortName}) — {environment}

Session files:
  {sessionState}
  {analystOnboarding}
  {architectLog}
```

### Step 7 — Create template files if missing

If the analyst onboarding file or architect log file don't exist yet, offer to create them from templates:

- **Analyst onboarding**: Create a template with sections for: role identity, working pattern, communication conventions, key project knowledge, recently active work. Customize with the user's role names and project context.
- **Architect log**: Create a blank log file with a header section.
- **SESSION-STATE.md**: Will be auto-generated on first `/team-startup`.

Ask: "Want me to create template files for {analyst onboarding} and {architect log}? I'll customize them with your team names."

### Step 8 — What's Next (guided mode only)

**Only display if guidedMode is true:**

```
WHAT'S NEXT
───────────
Your team is configured. Here's how the workflow works:

1. START A SESSION
   Type /team-startup in this session (the Implementer).
   You'll get two paste blocks — one for the Architect, one for the Analyst.
   Copy each into a fresh Claude session.
   All three confirm they're synced, then you start working.

2. DURING THE SESSION
   You (Implementer) write code and deploy.
   The Architect reviews your work and logs findings.
   The Analyst handles strategic decisions and design specs.
   The human facilitator (you) copy-pastes between sessions.

3. END A SESSION
   Type /team-closeout in this session.
   The Implementer commits, deploys, updates handoff files,
   and verifies everything is saved for the next session.
   Type "Closed" when all checks pass.

4. NEXT SESSION
   Open fresh sessions and type /team-startup again.
   Everyone picks up from the handoff files — no context lost.

💡 Tips will appear at each step of startup and closeout to
   guide you through. Say "stop handholding" at any time to
   turn them off permanently.

Ready to boot the team? Type /team-startup
```
