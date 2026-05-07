#!/usr/bin/env bash
set -euo pipefail
JS="$(dirname "$0")/../assets/widget.js"
if [ ! -f "$JS" ]; then
  echo "widget.js not found at $JS — run pnpm build first" >&2
  exit 1
fi
SIZE=$(gzip -c "$JS" | wc -c | tr -d ' ')
LIMIT=30000
echo "widget.js gzipped size: $SIZE bytes (limit: $LIMIT)"
if [ "$SIZE" -gt "$LIMIT" ]; then
  echo "FAIL: bundle exceeds $LIMIT bytes gzipped" >&2
  exit 1
fi
echo "OK"
