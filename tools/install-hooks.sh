#!/bin/bash
# Installs ARC git hooks from tools/hooks/ into the active git hooks directory.
# Safe to re-run — overwrites any existing hook of the same name.
# Run from the repo root.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$SCRIPT_DIR/hooks"

# Resolve the real hooks directory. In a worktree, .git is a file containing
# "gitdir: <path>", and hooks live in the main repo's common dir.
if [ ! -e .git ]; then
  echo "✗ .git not found in $(pwd)"
  echo "  Run this script from the repo root."
  exit 1
fi

GIT_COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null)"
if [ -z "$GIT_COMMON_DIR" ]; then
  echo "✗ Could not resolve git common dir. Is this a git repository?"
  exit 1
fi

HOOKS_DIR="$GIT_COMMON_DIR/hooks"
mkdir -p "$HOOKS_DIR"

INSTALLED=0
for src in "$SRC_DIR"/*; do
  [ -f "$src" ] || continue
  name="$(basename "$src")"
  dst="$HOOKS_DIR/$name"
  cp "$src" "$dst"
  chmod +x "$dst"
  echo "  ✓ Installed $name → $dst"
  INSTALLED=$((INSTALLED + 1))
done

if [ "$INSTALLED" -eq 0 ]; then
  echo "✗ No hooks found in $SRC_DIR"
  exit 1
fi

echo "✓ Installed $INSTALLED hook(s) successfully."
