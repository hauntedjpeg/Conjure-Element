#!/usr/bin/env bash
# Generate the Xcode wrapper for Safari into packages/safari.
#
# Run once, then commit the result. The project references the extension's
# build output in place (no --copy-resources), so day-to-day work is just
# `pnpm build:safari` followed by a rebuild in Xcode.
#
# Requires the Xcode licence to have been accepted:
#   sudo xcodebuild -license accept
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RESOURCES="$ROOT/packages/extension/.output/safari-mv3"
PROJECT_DIR="$ROOT/packages/safari"

# xcode-select may point at the Command Line Tools, which lack the converter.
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter is unavailable." >&2
  xcrun --find safari-web-extension-converter 2>&1 | sed 's/^/  /' >&2 || true
  echo >&2
  echo "If the message above mentions the licence, run:" >&2
  echo "  sudo xcodebuild -license accept" >&2
  exit 1
fi

if [ -e "$PROJECT_DIR" ] && [ "${1:-}" != "--force" ]; then
  echo "packages/safari already exists. Re-run with --force to regenerate." >&2
  exit 1
fi

(cd "$ROOT" && pnpm build:safari)

xcrun safari-web-extension-converter "$RESOURCES" \
  --project-location "$PROJECT_DIR" \
  --app-name "Conjure Element" \
  --bundle-identifier "dev.conjure.element" \
  --macos-only \
  --swift \
  --no-open \
  --no-prompt \
  --force

echo
echo "Generated $PROJECT_DIR"
echo "Next: pnpm safari:build, then follow docs/safari/MANUAL-CHECKLIST.md"
