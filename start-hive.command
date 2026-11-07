#!/bin/sh
# Kickswarm personal hive for macOS and Linux: double-click this file (or run ./start-hive.command).
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo
  echo " Kickswarm needs Node.js, a free program. Its download page opens now:"
  echo " take the LTS version, install it, then open start-hive again."
  (open https://nodejs.org/en/download 2>/dev/null || xdg-open https://nodejs.org/en/download) >/dev/null 2>&1
  exit 1
fi
echo
echo " Starting your hive. Your browser opens on the dashboard."
echo " Keep this window open while the hive works; close it to stop."
echo
exec node scripts/hive.mjs
