#!/usr/bin/env bash
# Self-register this CCD session's role for the ARC statusline.
# Usage:  bash tools/arc-role.sh coach|marc|freddy
# Writes "<CLAUDE_CODE_SESSION_ID> <role>" into .claude/session-roles so
# tools/arc-statusline.sh can color this window by role. Idempotent.
set -e
role="$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')"
case "$role" in
  coach|marc|freddy) ;;
  *) echo "usage: arc-role.sh coach|marc|freddy" >&2; exit 2 ;;
esac
sid="${CLAUDE_CODE_SESSION_ID:-}"
[ -z "$sid" ] && { echo "CLAUDE_CODE_SESSION_ID unset — cannot register" >&2; exit 1; }
dir="$(git rev-parse --show-toplevel 2>/dev/null || echo "$PWD")"
mkdir -p "$dir/.claude"
f="$dir/.claude/session-roles"
touch "$f"
# drop any prior line for this session id, then append the current mapping
tmp="$(mktemp)"; grep -vE "^$sid[[:space:]]" "$f" 2>/dev/null > "$tmp" || true
printf '%s %s\n' "$sid" "$role" >> "$tmp"
mv "$tmp" "$f"
echo "registered: $sid -> $role"
