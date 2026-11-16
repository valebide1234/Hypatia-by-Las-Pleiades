#!/bin/sh
# Refreshes the engine's data and rewrites public/engine/discovery.json for the Hypatia app.
#
# It asks every source again whose cached copy has expired (NASA POWER: 30 days), so each run
# picks up the months NASA has published since the last one, then re-scores, re-scans the global
# grid and exports. Pass --refresh to ignore the cache completely.
#
# Run it by hand (`npm run engine:update`) or from a scheduler, e.g. cron on the 5th of each month:
#   0 3 5 * *  /path/to/Hypatia/engine/scripts/update.sh >> /path/to/engine-update.log 2>&1
set -e
cd "$(dirname "$0")/.."
PY="${ENGINE_PYTHON:-.venv/bin/python}"
if [ ! -x "$PY" ] && [ -z "$ENGINE_PYTHON" ]; then
  # The engine was developed and tested with Python 3.13; use it when it is installed.
  BASE="$(command -v python3.13 || command -v python3)"
  echo "Creating the engine's Python environment with $BASE (first run only)..."
  "$BASE" -m venv .venv
  .venv/bin/pip install --quiet -r requirements.txt
fi
"$PY" -m analogs.pipeline all "$@"
