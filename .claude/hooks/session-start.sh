#!/usr/bin/env bash
# Gets the machine ready before work begins, so the first build of a session
# never fails on a missing tool. Idempotent, quiet when there is nothing to do.
set -uo pipefail

say() { echo "[project-crawlers] $*"; }
missing=()

# Python: openpyxl is what will read docs/balance.xlsx once the sheet exists.
if ! python3 -c 'import openpyxl' >/dev/null 2>&1; then
  say "installing openpyxl..."
  pip install --quiet --disable-pip-version-check openpyxl >/dev/null 2>&1 \
    || missing+=("openpyxl (the balance sheet reader)")
fi

# Playwright drives the headless tests. Prefer whatever is already installed.
if ! node -e 'require("playwright")' >/dev/null 2>&1 \
  && ! node -e 'require("/opt/node22/lib/node_modules/playwright")' >/dev/null 2>&1; then
  say "installing playwright..."
  npm install -g --silent playwright >/dev/null 2>&1 \
    || missing+=("playwright (the test browser driver)")
fi

# The browser itself is pre-installed in this image; never re-download it.
if [ ! -d "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" ]; then
  missing+=("chromium (the test browser)")
fi

if [ ${#missing[@]} -gt 0 ]; then
  say "NOT READY -- missing: ${missing[*]}"
  say "tests may not run. Build still works."
else
  say "ready. build: python3 build.py   test: node tests/run.mjs"
fi
exit 0
