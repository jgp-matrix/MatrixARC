#!/bin/bash
# Headless Claude review of uncommitted ARC changes
# Usage:
#   ./tools/review.sh                   # review all uncommitted changes
#   ./tools/review.sh public/modules    # only changes under public/modules
#   ./tools/review.sh functions         # only Cloud Functions changes

FILTER="${1:-}"

if [ -n "$FILTER" ]; then
  DIFF=$(git diff HEAD -- "$FILTER")
else
  DIFF=$(git diff HEAD)
fi

if [ -z "$DIFF" ]; then
  echo "No uncommitted changes to review."
  exit 0
fi

# Truncate at 12000 chars to keep token usage reasonable
DIFF_TRUNCATED=$(echo "$DIFF" | head -c 30000)

echo "$DIFF_TRUNCATED" | claude -p "Review this diff from ARC, a homegrown JSX-pipeline industrial control panel quoting tool.

Focus areas in priority order:
1. Pricing math correctness (margins, markups, quoteBuilder logic, BOM totals)
2. Firestore writes that could corrupt data or violate schema
3. Async/await error handling — especially missing try/catch around Firestore or external API calls
4. Breaking changes to module exports or function signatures
5. Obvious logic errors

Be terse. Cite specific file and approximate line. If the diff looks fine, say 'Looks clean.' Skip stylistic nits unless they affect correctness."
