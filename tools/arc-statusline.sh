#!/usr/bin/env bash
# ARC per-role statusline — renders a colored role label so the three CCD
# sessions (Coach / Marc / Freddy) are distinguishable at a glance.
#
# Role resolution (first match wins):
#   1. $ARC_ROLE env var (coach|marc|freddy)
#   2. Session-id map: .claude/session-roles  (lines: "<CLAUDE_CODE_SESSION_ID> <role>")
#      -> each session self-registers via  bash tools/arc-role.sh <role>
#   3. A `.claude/role` marker file in the working dir
#   4. The git branch name (coach* / marc* / freddy*)
#   5. Fallback: no role -> plain "ARC" + branch + version
#
# Works in a SHARED checkout: resolution #2 keys on the per-window session id,
# so three sessions in one directory on one branch still label independently.
#
# Wire via .claude/settings.json:
#   "statusLine": { "type": "command", "command": "bash tools/arc-statusline.sh" }
# Claude Code passes a JSON blob on stdin (session_id, cwd, ...).

input="$(cat 2>/dev/null)"

# --- resolve working dir (prefer stdin cwd, else PWD) ---
cwd="$(printf '%s' "$input" | sed -n 's/.*"current_dir"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -z "$cwd" ] && cwd="$(printf '%s' "$input" | sed -n 's/.*"cwd"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -z "$cwd" ] && cwd="$PWD"

# --- resolve session id (prefer stdin, else env) ---
sid="$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
[ -z "$sid" ] && sid="$CLAUDE_CODE_SESSION_ID"

# --- resolve role ---
role=""
# 1. env override
[ -n "$ARC_ROLE" ] && role="$(printf '%s' "$ARC_ROLE" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
# 2. session-id map
if [ -z "$role" ] && [ -n "$sid" ] && [ -f "$cwd/.claude/session-roles" ]; then
  role="$(grep -E "^$sid[[:space:]]" "$cwd/.claude/session-roles" 2>/dev/null | head -1 | awk '{print $2}' | tr '[:upper:]' '[:lower:]')"
fi
# 3. marker file
if [ -z "$role" ] && [ -f "$cwd/.claude/role" ]; then
  role="$(tr -d '[:space:]' < "$cwd/.claude/role" | tr '[:upper:]' '[:lower:]')"
fi
# 4. branch name
branch="$(git -C "$cwd" branch --show-current 2>/dev/null)"
if [ -z "$role" ] && [ -n "$branch" ]; then
  case "$branch" in
    coach*)  role="coach"  ;;
    marc*)   role="marc"   ;;
    freddy*) role="freddy" ;;
  esac
fi

# --- app version (best-effort) ---
ver="$(sed -n 's/.*APP_VERSION[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$cwd/public/index.html" 2>/dev/null | head -1)"

# --- ANSI ---
R='\033[0m'                    # reset
RED_BG='\033[41;97;1m'         # bold white on red   (Coach)
BLU_BG='\033[44;97;1m'         # bold white on blue  (Marc)
GRN_BG='\033[42;30;1m'         # bold black on green (Freddy)
DIM='\033[2m'

case "$role" in
  coach)  seg="${RED_BG} 🏈 Coach - ARC ${R}" ;;
  marc)   seg="${BLU_BG} 🔨 Marc - ARC ${R}"  ;;
  freddy) seg="${GRN_BG} 🧪 Freddy - ARC ${R}" ;;
  *)      seg="${DIM}ARC${R}" ;;
esac

# --- compose ---
line="$seg"
[ -n "$branch" ] && line="$line ${DIM}⎇ ${branch}${R}"
[ -n "$ver" ]    && line="$line ${DIM}· ${ver}${R}"

printf '%b' "$line"
