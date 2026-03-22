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

# Commit, tag, push
cd "$REPO"
git add public/index.html
git commit -m "Release $NEW_VERSION"
git tag "$NEW_VERSION"
git push origin master
git push origin "$NEW_VERSION"

# Deploy to Firebase
firebase deploy --only hosting

echo ""
echo "✓ Deployed $NEW_VERSION to Firebase"
