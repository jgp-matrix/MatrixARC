#!/usr/bin/env bash
# MatrixARC deploy script — bumps version, commits, tags, pushes, deploys
set -e

REPO="/c/Users/jon/AppDev/MatrixARC"
HTML="$REPO/public/index.html"

# Get current version from index.html
CURRENT=$(grep -o 'APP_VERSION="v[0-9]*\.[0-9]*\.[0-9]*"' "$HTML" | grep -o 'v[0-9]*\.[0-9]*\.[0-9]*')
if [ -z "$CURRENT" ]; then
  echo "ERROR: Could not find APP_VERSION in index.html"
  exit 1
fi

# Bump patch version
MAJOR=$(echo "$CURRENT" | cut -d. -f1 | tr -d 'v')
MINOR=$(echo "$CURRENT" | cut -d. -f2)
PATCH=$(echo "$CURRENT" | cut -d. -f3)
NEW_PATCH=$((PATCH + 1))
NEW_VERSION="v${MAJOR}.${MINOR}.${NEW_PATCH}"

echo "Bumping $CURRENT → $NEW_VERSION"

# Update APP_VERSION in index.html
sed -i "s/APP_VERSION=\"$CURRENT\"/APP_VERSION=\"$NEW_VERSION\"/" "$HTML"

# Verify the APP_VERSION replacement actually happened (sed exits 0 even with no match — see
# REVIEW_FINDINGS #14). Without this, the failure mode is a confusing
# "nothing to commit" downstream instead of a clear sed-pattern-miss error.
if ! grep -q "APP_VERSION=\"$NEW_VERSION\"" "$HTML"; then
  echo "ERROR: sed did not replace APP_VERSION in $HTML"
  echo "  Expected pattern after replace: APP_VERSION=\"$NEW_VERSION\""
  echo "  Original APP_VERSION line may have shifted format. Inspect $HTML manually."
  exit 1
fi

# DECISION(v1.19.769): Cache-bust the bundle URL on every deploy. The <script src="index.bundle.js?v=...">
# tag in index.html carries a query-string version. Browsers cache by full URL, so changing the ?v=
# value forces every client to fetch the new bundle on next load. The sed below rewrites whatever ?v=
# value is currently in the file (matched by the [^"']* pattern) to the just-bumped $NEW_VERSION.
# That stamped value is committed to git as part of the release commit further down.
sed -i "s|index.bundle.js?v=[^\"']*|index.bundle.js?v=$NEW_VERSION|" "$HTML"

# Verify the bundle ?v= replacement actually happened. sed exits 0 even with no match — so if the
# index.bundle.js?v= pattern ever shifts (e.g. someone moves the bundle to a <link> import or drops
# the query param), this would silently ship without busting the browser cache and users would stay
# on the old bundle. Mirrors the APP_VERSION verification immediately above (REVIEW_FINDINGS #14).
if ! grep -q "index.bundle.js?v=$NEW_VERSION" "$HTML"; then
  echo "ERROR: sed did not update index.bundle.js?v= in $HTML"
  echo "  Expected pattern after replace: index.bundle.js?v=$NEW_VERSION"
  echo "  The bundle script tag may have shifted format. Inspect $HTML manually."
  exit 1
fi

# DECISION(v1.19.767): Build the JSX bundle (src/app.jsx → public/index.bundle.js)
# BEFORE git commit and firebase deploy. validate_jsx.js validates syntax and writes
# the compiled JS — replaces the in-browser babel-standalone transform that used to
# happen on every page load.
cd "$REPO"
echo "Building JSX bundle…"
node validate_jsx.js

# Commit, tag, push (bundle is gitignored, regenerated each deploy)
git add public/index.html src/app.jsx 2>/dev/null || git add public/index.html
git commit -m "Release $NEW_VERSION"
git tag "$NEW_VERSION"
git push origin master
git push origin "$NEW_VERSION"

# Deploy to Firebase (firebase picks up public/index.bundle.js since it lives in public/)
firebase deploy --only hosting

echo ""
echo "✓ Deployed $NEW_VERSION to Firebase"
