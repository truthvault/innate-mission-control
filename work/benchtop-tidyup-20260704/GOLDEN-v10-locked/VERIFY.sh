#!/usr/bin/env bash
# One-command guard for the benchtop rotated-corner feature.
# 1) confirms the working files still match this golden snapshot (checksum)
# 2) runs the rotated-corner canary against the golden bundle
# Exit 0 = safe. Non-zero = STOP, do not ship.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(cd "$HERE/.." && pwd)"
NODE_MODULES="/Users/mack-mini/innate-mission-control/node_modules"

echo "== 1. checksum: working files vs golden =="
drift=0
check() {  # $1 golden file, $2 working file
  g=$(md5 -q "$HERE/$1"); w=$(md5 -q "$2" 2>/dev/null || echo MISSING)
  if [ "$g" = "$w" ]; then echo "  OK   $1"; else echo "  DRIFT $1  (golden=$g working=$w)"; drift=1; fi
}
check innate-benchtop-configurator.js "$WORK/assets/innate-benchtop-configurator.js"
check page-benchtops-atelier.css       "$WORK/assets/page-benchtops-atelier.css"
check benchtops-atelier.liquid         "$WORK/sections/benchtops-atelier.liquid"
if [ "$drift" = "1" ]; then
  echo "  (working copy differs from golden — that's fine if you're intentionally iterating,"
  echo "   but the canary below runs against the GOLDEN files, not your working copy.)"
fi

echo "== 2. rotated-corner canary (against golden bundle) =="
NODE_PATH="$NODE_MODULES" node "$HERE/lock-rotated-corners.mjs"
