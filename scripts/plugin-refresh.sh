#!/usr/bin/env bash
# Rebuild cypress-ai-vitals, pack it, and install the tarball the same way a user would.
set -euo pipefail
PLUGIN_DIR="$(cd "$(dirname "$0")/../../cypress-ai-vitals" && pwd)"
DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
npm --prefix "$PLUGIN_DIR" run build --silent
rm -f "$PLUGIN_DIR"/cypress-ai-vitals-*.tgz
TARBALL="$(cd "$PLUGIN_DIR" && npm pack --silent)"
cd "$DEMO_DIR"
rm -rf node_modules/cypress-ai-vitals
npm install --save-dev --no-audit --no-fund "$PLUGIN_DIR/$TARBALL"
echo "installed $(node -p "require('cypress-ai-vitals/package.json').version") from $TARBALL"
