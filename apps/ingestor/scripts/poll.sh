#!/usr/bin/env bash
set -euo pipefail

URL="${INGEST_URL:-http://localhost:3001/api/ingest}"

echo "Polling $URL every 60s (Ctrl+C to stop)..."
while true; do
  echo "--- $(date -u +%Y-%m-%dT%H:%M:%SZ) ---"
  curl -s "$URL"
  echo
  sleep 60
done
