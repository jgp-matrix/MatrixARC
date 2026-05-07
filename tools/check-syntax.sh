#!/bin/bash
# Quick syntax check across ARC's JS files
# Usage: ./tools/check-syntax.sh

ERRORS=0
while IFS= read -r file; do
  if ! node --check "$file" 2>&1; then
    ERRORS=$((ERRORS + 1))
  fi
done < <(find public/modules functions -name "*.js" -not -path "*/node_modules/*")

if [ $ERRORS -eq 0 ]; then
  echo "✓ All JS files parse cleanly"
else
  echo "✗ $ERRORS file(s) have syntax errors"
  exit 1
fi
