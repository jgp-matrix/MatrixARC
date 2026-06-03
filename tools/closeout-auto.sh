#!/usr/bin/env bash
# closeout-auto.sh — Gather state for session close out
# Called by Marc during /closeout skill. Output is structured for parsing.
# Read-only — does not modify any files.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "=== CLOSEOUT STATE ==="

echo ""
echo "--- git status ---"
git status

echo ""
echo "--- current branch ---"
git branch --show-current

echo ""
echo "--- APP_VERSION ---"
grep -o 'APP_VERSION="[^"]*"' public/index.html | head -1

echo ""
echo "--- origin sync ---"
local_sha=$(git rev-parse HEAD)
remote_sha=$(git rev-parse origin/master 2>/dev/null || echo "unknown")
echo "Local HEAD:    $local_sha"
echo "origin/master: $remote_sha"
if [ "$local_sha" = "$remote_sha" ]; then
    echo "STATUS: IN SYNC"
else
    echo "STATUS: AHEAD — push needed"
fi

echo ""
echo "--- session commits (last 10) ---"
git log --oneline -10

echo ""
echo "--- handoff file status ---"
for f in SESSION-STATE.md FREDDY.md COACH.md; do
    if [ -f "$f" ]; then
        status=$(git status --porcelain "$f" 2>/dev/null || true)
        if [ -z "$status" ]; then
            echo "$f: committed (clean)"
        else
            echo "$f: MODIFIED — needs commit"
        fi
    else
        echo "$f: NOT FOUND"
    fi
done

echo ""
echo "--- OPEN TODOs ---"
if [ -f TODO.md ]; then
    count=$(grep -c '\*\*OPEN\*\*' TODO.md || true)
    echo "OPEN findings: $count"
else
    echo "TODO.md not found"
fi

echo ""
echo "--- feature branches ---"
current=$(git branch --show-current)
if [ "$current" != "master" ]; then
    echo "WARNING: On branch '$current', not master"
    ahead=$(git log master.."$current" --oneline 2>/dev/null | wc -l || echo "?")
    echo "Commits ahead of master: $ahead"
else
    echo "On master (no merge needed)"
fi

echo ""
echo "=== CLOSEOUT STATE COMPLETE ==="
