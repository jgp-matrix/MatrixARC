#!/usr/bin/env bash
# startup-auto.sh — Gather state for session startup
# Called by Marc during /startup skill. Output is structured for parsing.
# Read-only — does not modify any files.

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

echo "=== STARTUP STATE ==="

echo ""
echo "--- verify-state ---"
bash ./tools/verify-state.sh

echo ""
echo "--- APP_VERSION ---"
grep -o 'APP_VERSION="[^"]*"' public/index.html | head -1

echo ""
echo "--- SESSION-STATE staleness ---"
if [ -f SESSION-STATE.md ]; then
    state_date=$(head -1 SESSION-STATE.md | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' || echo "unknown")
    latest_commit_date=$(git log -1 --format=%ci | cut -d' ' -f1)
    echo "SESSION-STATE date: $state_date"
    echo "Latest commit date: $latest_commit_date"
    if [ "$state_date" != "$latest_commit_date" ]; then
        echo "STATUS: STALE — regeneration needed"
    else
        echo "STATUS: CURRENT"
    fi
else
    echo "STATUS: MISSING — generation needed"
fi

echo ""
echo "--- OPEN TODOs ---"
if [ -f TODO.md ]; then
    count=$(grep -c '\*\*OPEN\*\*' TODO.md || true)
    echo "OPEN findings: $count"
else
    echo "TODO.md not found"
fi

echo ""
echo "--- OVERNIGHT-LOG check ---"
if [ -f OVERNIGHT-LOG.md ]; then
    last_entry=$(grep -n "^## " OVERNIGHT-LOG.md | tail -1 || echo "none")
    echo "Last entry: $last_entry"
    # Check if there are any unresolved items (entries without a corresponding resolution)
    unresolved=$(grep -ci "unresolved\|pending\|blocked\|waiting" OVERNIGHT-LOG.md || true)
    echo "Potential unresolved mentions: $unresolved"
else
    echo "OVERNIGHT-LOG.md not found"
fi

echo ""
echo "=== STARTUP STATE COMPLETE ==="
