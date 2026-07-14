#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MatrixARC TEST deploy script (G009) — deploys the TEST hosting target ONLY.
#
# PROD-SAFE BY CONSTRUCTION. This script must NEVER touch production:
#   • It does NOT bump APP_VERSION (prod semver is owned by deploy.sh).
#   • It does NOT create a git tag.
#   • It does NOT run `firebase deploy --only hosting:production`.
#   • It does NOT push to origin.
# It bumps ONLY the monotonic TEST_BUILD counter, cache-busts the bundle URL with
# a "-T<NNN>" suffix, writes a testBuild-tagged version.json, logs the build to
# docs/TEST-BUILDS.md, and deploys `hosting:test` (matrix-arc-test.web.app) alone.
#
# NOTE: matrix-arc-test shares the SAME Firebase project / Firestore / BC as prod.
# It isolates the BUILD, never the DATA. firestore.rules are shared prod infra and
# are NOT pushed by default — pass --with-rules to opt in explicitly.
#
# NOTE (shared-tree hygiene): commit or stash unrelated work BEFORE running — this
# script `git add`s public/index.html, public/version.json, docs/TEST-BUILDS.md,
# and src/app.jsx, so a dirty tree risks sweeping other sessions' staged changes.
#
# Usage:
#   ./deploy-test.sh "one-line change description"
#   ./deploy-test.sh --with-rules "one-line change description"
# ─────────────────────────────────────────────────────────────────────────────
set -e

# Operate on the checkout this script lives in (safer than a hardcoded path —
# won't accidentally act on the wrong worktree).
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HTML="$REPO/public/index.html"

# ── Parse args: --with-rules flag + optional change description ────────────────
WITH_RULES=0
CHANGE_DESC=""
for arg in "$@"; do
  if [ "$arg" = "--with-rules" ]; then
    WITH_RULES=1
  else
    CHANGE_DESC="$arg"
  fi
done
[ -z "$CHANGE_DESC" ] && CHANGE_DESC="(no description)"

# ── Read prod base version (READ ONLY — never bumped here) ─────────────────────
APP_VERSION=$(grep -o 'APP_VERSION="v[0-9]*\.[0-9]*\.[0-9]*"' "$HTML" | grep -o 'v[0-9]*\.[0-9]*\.[0-9]*')
if [ -z "$APP_VERSION" ]; then
  echo "ERROR: Could not find APP_VERSION in $HTML"
  exit 1
fi

# ── Read + bump the monotonic TEST_BUILD counter ──────────────────────────────
CUR=$(grep -o 'TEST_BUILD="[0-9]*"' "$HTML" | grep -o '[0-9]*')
if [ -z "$CUR" ]; then
  echo "ERROR: Could not find TEST_BUILD in $HTML"
  exit 1
fi
# 10# forces base-10 so leading-zero values (008, 009) don't get read as octal.
NEW=$(printf '%03d' $((10#$CUR + 1)))

echo "Test build: V.$CUR → V.$NEW   (base $APP_VERSION)"

# ── Bump TEST_BUILD in index.html (verify-after-sed; mirrors deploy.sh:30) ─────
sed -i "s/TEST_BUILD=\"$CUR\"/TEST_BUILD=\"$NEW\"/" "$HTML"
if ! grep -q "TEST_BUILD=\"$NEW\"" "$HTML"; then
  echo "ERROR: sed did not update TEST_BUILD in $HTML"
  echo "  Expected after replace: TEST_BUILD=\"$NEW\""
  exit 1
fi

# ── Cache-bust the bundle URL with an APP_VERSION-T<NNN> suffix ────────────────
# Matches whatever ?v= value is currently present (idempotent — a prior -T suffix
# is overwritten, not appended). This is the ONLY reliable stale-build signal on
# the test host, since APP_VERSION never moves for a test-only deploy.
BUNDLE_TAG="$APP_VERSION-T$NEW"
sed -i "s|index.bundle.js?v=[^\"']*|index.bundle.js?v=$BUNDLE_TAG|" "$HTML"
if ! grep -q "index.bundle.js?v=$BUNDLE_TAG" "$HTML"; then
  echo "ERROR: sed did not update index.bundle.js?v= in $HTML"
  echo "  Expected after replace: index.bundle.js?v=$BUNDLE_TAG"
  exit 1
fi

# ── Write version.json with the testBuild key (freshness loop-guard reads this) ─
echo "{\"version\":\"$APP_VERSION\",\"testBuild\":\"$NEW\"}" > "$REPO/public/version.json"

cd "$REPO"

# ── Same build gates as prod: scope checker + JSX compile ─────────────────────
if [ -f "$REPO/tools/check-scope.js" ]; then
  echo "Running scope checker…"
  if ! node tools/check-scope.js; then
    echo ""
    echo "ERROR: Scope checker found NEW undefined-reference violations. Fix before deploying."
    exit 1
  fi
fi

echo "Building JSX bundle…"
node validate_jsx.js

# ── Log the build to docs/TEST-BUILDS.md ──────────────────────────────────────
BUILDS_LOG="$REPO/docs/TEST-BUILDS.md"
SHORT_SHA=$(git rev-parse --short HEAD)
BUILD_DATE=$(date +%Y-%m-%d)
if [ ! -f "$BUILDS_LOG" ]; then
  echo "ERROR: $BUILDS_LOG is missing — expected the seeded log to exist."
  exit 1
fi
echo "| V.$NEW | $BUNDLE_TAG | $SHORT_SHA | $CHANGE_DESC | $BUILD_DATE |" >> "$BUILDS_LOG"

# ── Deploy TEST hosting ONLY (never production) ────────────────────────────────
DEPLOY_TARGETS="hosting:test"
if [ "$WITH_RULES" = "1" ]; then
  DEPLOY_TARGETS="hosting:test,firestore:rules"
  echo "⚠  --with-rules: also deploying firestore:rules (SHARED prod infra)."
fi
echo "Deploying $DEPLOY_TARGETS …"
firebase deploy --only "$DEPLOY_TARGETS"

# ── Commit locally (explicit pathspec; NO tag, NO push, NO APP_VERSION bump) ───
git add public/index.html public/version.json docs/TEST-BUILDS.md src/app.jsx
git commit -m "Test build V.$NEW"

echo ""
echo "✓ Deployed Test V.$NEW (base $APP_VERSION) to matrix-arc-test.web.app"
echo "  Prod untouched: APP_VERSION not bumped, no tag, no hosting:production, no push."
