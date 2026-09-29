#!/usr/bin/env bash
# Rebuild the extension for Safari and compile the Xcode wrapper, unsigned.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT_DIR="$ROOT/packages/safari"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

PROJECT="$(find "$PROJECT_DIR" -maxdepth 2 -name '*.xcodeproj' -print -quit 2>/dev/null || true)"
if [ -z "$PROJECT" ]; then
  echo "No Xcode project in packages/safari. Run: pnpm safari:generate" >&2
  exit 1
fi

(cd "$ROOT" && pnpm build:safari)

xcodebuild \
  -project "$PROJECT" \
  -scheme "Conjure Element" \
  -configuration Debug \
  -derivedDataPath "$PROJECT_DIR/build" \
  CODE_SIGN_IDENTITY="-" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=YES \
  build | tail -n 20

APP="$(find "$PROJECT_DIR/build/Build/Products/Debug" -maxdepth 1 -name '*.app' -print -quit)"
echo
echo "Built $APP"
echo "Open it once with:  open \"$APP\""
