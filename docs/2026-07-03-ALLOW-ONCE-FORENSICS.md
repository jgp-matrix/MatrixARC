# Allow-Once / settings-file forensics — 2026-07-03

**Author:** Sam Wize (Coach) · **Type:** Read-only forensic snapshot (no files modified during capture)
**Status:** Evidence preserved for **Jon's intermittent-permission-prompt investigation, which is currently TABLED** — captured for if/when he resumes.
**Ties to:** **G001** — the cross-session `send_message` "Allow Once" prompt is **per-SEND (not per-target — confirmed live 2026-07-03), hardcoded, and not suppressible** by any allowlist or permission mode. These findings corroborate G001: no `send_message` allow rule exists anywhere to suppress it (the earlier `a1e786d3` allow rule was reverted in `d318170b`).

Symptom under investigation (separate thread, not resolved here): comms works but throws intermittent permission prompts (some auto-approve, some stall up to ~5 in a row), and it broke once after a session reload.

---

## 1. Permissions object per file (+ last-modified)

### A. `.claude/settings.local.json` — project-local, **git-UNTRACKED** — mtime 2026-07-02 19:26:24 -0600
- `permissions.allow` only (47 entries): MCP Chrome tools under **two** namespaces (`mcp__Claude_in_Chrome__*` AND lowercase `mcp__claude-in-chrome__*`), plus a grab-bag of one-off approved `PowerShell(...)` commands (specific-arg — the accumulated per-session "Allow" clicks), plus `Bash(mkdir -p .claude/commands)`, `Skill(claude-api)`, `Skill(claude-api:*)`.
- **No `deny`, no `ask`, no `defaultMode`.**
- **`mcp__ccd_session_mgmt__send_message`: ABSENT.**

### B. `.claude/settings.json` — project-shared, **git-TRACKED** — mtime 2026-07-02 13:58:43 -0600
- `statusLine` (`bash tools/arc-statusline.sh`) + `permissions.allow` (18 entries): `Read`, `Grep`, `Glob`, `Bash(git status:*|git diff:*|git log:*|git show:*|git rev-parse:*|git branch:*|git add:*|git commit:*|git push:*|git pull:*|git fetch:*|git stash:*)`, `Bash(node validate_jsx.js:*)`, `Bash(node --check:*)`, `Bash(pwsh:*)`.
- **No `deny`, no `ask`, no `defaultMode`.**
- **`mcp__ccd_session_mgmt__send_message`: ABSENT.**

### C. `~/.claude/settings.json` (`C:\Users\jon\.claude\settings.json`) — user-global — mtime 2026-06-29 11:26:05 -0600
- `permissions.allow`: `["Bash(*)","Edit(*)","Write(*)","Read(*)","Glob(*)","Grep(*)","Agent(*)"]`
- **`permissions.defaultMode`: `"bypassPermissions"`**
- Also: `"skipDangerousModePermissionPrompt": true`, `"model": "claude-opus-4-6"`, `"tui": "fullscreen"`, and a `hooks` block (PreCompact preserve-context prompt; SessionStart/UserPromptSubmit/PostToolUse/PostToolUseFailure/Stop/Notification each POST to `https://us-central1-ccd-monitor.cloudfunctions.net/ccdHook` with a bearer token; SessionStart also runs `date -Iseconds && date +%Z`).
- **No `deny`, no `ask`. `mcp__ccd_session_mgmt__send_message`: ABSENT.**

## 2. Effective permission mode
- **Only `~/.claude/settings.json` sets a mode: `defaultMode: "bypassPermissions"`** (+ `skipDangerousModePermissionPrompt: true`).
- Neither project file sets `defaultMode`, `ask`, or `deny`.
- ⇒ File-level default is **bypassPermissions** (user-global); any "Ask permissions" state is a per-session runtime override, not written to these files. (Team lore: sessions are manually switched to "Ask permissions" at boot; a reload dropping a session back toward the file default is a plausible surface for the "broke after reload" symptom — **not asserted, for the investigation to confirm**.)

## 3. Config backups (up to 5) — found **5**, all in `C:\Users\jon\.claude\backups\` (none in project `.claude`)
Backups of **`.claude.json`** (global CLI state), named `.claude.json.backup.<epoch-ms>`, 62100 bytes each. (Filename-epoch runs ~one-rotation ahead of file mtime — each name ≈ the next file's write time.)

| Filename (epoch-ms → local) | file mtime |
|---|---|
| `.claude.json.backup.1783031243182` → 2026-07-02 16:27:23 | 2026-07-02 16:03:05 |
| `.claude.json.backup.1783034416261` → 2026-07-02 17:20:16 | 2026-07-02 16:27:23 |
| `.claude.json.backup.1783039213471` → 2026-07-02 18:40:13 | 2026-07-02 17:20:16 |
| `.claude.json.backup.1783039978596` → 2026-07-02 18:52:58 | 2026-07-02 18:40:13 |
| **`.claude.json.backup.1783041216083`** → **2026-07-02 19:13:36** (MOST RECENT) | 2026-07-02 18:52:58 |

**Allow array of the most recent backup (`1783041216083`):** top-level `.permissions` = none; top-level `.allowedTools` = none; project `C:\Users\jon\AppDev\MatrixARC` → `allowedTools: []` (empty). ⇒ The `.claude.json` backups carry the **legacy per-project `allowedTools`** mechanism (empty here), **not** the settings.json `permissions.allow`. No substantive allow-list in the backups.

## 4. Git tracking
- **`.claude/settings.json` — git-TRACKED, working tree CLEAN.** Last commit touching it: `31d21a14  2026-07-02 13:59:05 -0600  "G004: safe tool-permission allowlist in .claude/settings.json (git/node/pwsh/read-only) — persists to new sessions; comm-prompt untouched (hardcoded); verify at G002 reboot"`.
- **`.claude/settings.local.json` — NOT tracked** (gitignored via global ignore `C:\Users\jon/.config/git/ignore:3: **/.claude/settings.local.json`); no git history.
- **`~/.claude/settings.json`** — outside this repo (user home); not git-tracked here.

## 5. `mcp__ccd_session_mgmt` rule search (allow / ask / deny), all three files
- `.claude/settings.local.json`: **NONE**
- `.claude/settings.json`: **NONE**
- `~/.claude/settings.json`: **NONE**
- `defaultMode`: present only in `~/.claude/settings.json` = `bypassPermissions`. No `ask`/`deny` arrays exist in any file.

---

## Summary for the investigation
- **No `send_message` allow rule exists in any settings file**, in any list — consistent with G001 (the prompt is hardcoded/not-suppressible; the prior allow rule `a1e786d3` was reverted `d318170b`). So the intermittent prompts are **not** governed by an allow-list entry.
- The only on-disk mode directive is user-global **`bypassPermissions`**; project files are silent on mode. Session-level "Ask permissions" is a runtime override.
- `settings.local.json` (untracked, most-recently-modified) is where per-session one-off "Allow" approvals accumulate — the likely store behind "some auto-approve" behavior.
- These are the facts as of 2026-07-03; the intermittent-prompt investigation remains **TABLED** pending Jon.
