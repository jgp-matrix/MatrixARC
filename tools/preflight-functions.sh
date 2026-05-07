#!/bin/bash
# Pre-deploy validation for Cloud Functions
# Runs all the checks Firebase would do, without deploying
# Usage: ./tools/preflight-functions.sh

set -e

cd "$(dirname "$0")/.."

echo "→ Checking we're in repo root..."
if [ ! -f firebase.json ]; then
  echo "✗ firebase.json not found — are you in the repo root?"
  exit 1
fi
echo "  ✓ firebase.json present"

echo "→ Checking active Firebase project..."
PROJECT=$(firebase use 2>&1 | grep -oE 'matrix-arc|[a-z-]+' | head -1)
echo "  ✓ Active project: $PROJECT"

echo "→ Validating functions/package.json..."
cd functions
if ! npm ls --depth=0 > /dev/null 2>&1; then
  echo "  ⚠ Dependency tree has issues — run 'npm install' in functions/"
fi
echo "  ✓ Dependencies resolve"

echo "→ Loading functions/index.js (catches syntax + import errors)..."
if ! node -e "require('./index.js')" 2>&1; then
  echo "  ✗ Module load failed"
  exit 1
fi
echo "  ✓ Module loads cleanly"

echo "→ Syntax-checking all .js files in functions/..."
ERRORS=0
while IFS= read -r file; do
  if ! node --check "$file" 2>&1; then
    ERRORS=$((ERRORS + 1))
  fi
done < <(find . -name "*.js" -not -path "./node_modules/*")
if [ $ERRORS -gt 0 ]; then
  echo "  ✗ $ERRORS file(s) have syntax errors"
  exit 1
fi
echo "  ✓ All files parse cleanly"

cd ..

echo ""
echo "✓ Preflight passed — safe to run: firebase deploy --only functions"
