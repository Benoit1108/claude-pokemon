#!/usr/bin/env bash
# Mirrors .github/workflows/ci.yml so a green local run means a green CI run.
# Wired up as a Husky pre-push hook (.husky/pre-push) — also re-runnable
# manually via `npm run ci:pre-push`. Skip in emergencies : `git push --no-verify`.
#
# Order is "cheap-and-fast first" so unrelated issues fail early :
#   1. JSON validation (~ms)
#   2. shellcheck on bash (~1s)
#   3. data.default.json build drift (~1s)
#   4. api/ : eslint / prettier / typecheck / vitest (~5-10s)
#
# `set -e` is intentionally NOT used — we want every gate to report, not just
# the first one. We tally failures in $fails and exit non-zero at the end.

set -u
fails=0
step=0

run() {
  step=$((step + 1))
  local label="$1"; shift
  printf '\n\033[1;36m[%d] %s\033[0m\n' "$step" "$label"
  if "$@"; then
    printf '  \033[32m✓\033[0m\n'
  else
    printf '  \033[31m✗ FAILED\033[0m\n'
    fails=$((fails + 1))
  fi
}

cd "$(git rev-parse --show-toplevel)"

run "Validate top-level JSON sources (jq empty)" bash -c '
  for f in lib/data.default.json lib/data/config.json lib/data/thresholds.json \
           lib/data/seasons.json lib/data/items.json lib/data/berries.json \
           lib/data/special/*.json lib/data/lineages/*.json \
           lib/data/wild_pool/*.json lib/locales/fr.json lib/locales/en.json; do
    jq empty "$f" || exit 1
  done
'

run "shellcheck (errors only) on published scripts" bash -c '
  if ! command -v shellcheck >/dev/null 2>&1; then
    echo "  (shellcheck not installed locally, skipping — CI still enforces it)"
    exit 0
  fi
  shellcheck -S error \
    bin/install.sh bin/uninstall.sh bin/status.sh \
    bin/update.sh bin/export.sh bin/import.sh \
    lib/lib.sh lib/statusline.sh lib/pokemon-status.sh \
    lib/build-data.sh
'

run "lib/data.default.json is in sync with lib/data/** sources" bash -c '
  bash lib/build-data.sh >/dev/null
  if ! git diff --exit-code --quiet lib/data.default.json; then
    echo "  ::error:: data.default.json is stale. Run \`npm run build:data\` and stage the result."
    git --no-pager diff --stat lib/data.default.json
    exit 1
  fi
'

run "api : ESLint"           npm run -s -w api lint
run "api : Prettier check"   npm run -s -w api format:check
run "api : TypeScript check" npm run -s -w api typecheck
run "api : Vitest"           npm run -s -w api test

echo
if [ "$fails" -gt 0 ]; then
  printf '\033[31m✗ %d gate(s) failed.\033[0m Push aborted.\n' "$fails"
  echo 'To bypass in emergencies: git push --no-verify'
  exit 1
fi
printf '\033[32m✓ All CI gates green.\033[0m\n'
