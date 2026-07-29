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

run "npm audit (api/, prod, high+)" bash -c '
  cd api && npm audit --omit=dev --audit-level=high
'

run "i18n FR ↔ EN locale parity (lib/locales)" bash -c '
  fr_keys=$(jq -r "paths(scalars) | join(\".\")" lib/locales/fr.json | sort -u)
  en_keys=$(jq -r "paths(scalars) | join(\".\")" lib/locales/en.json | sort -u)
  missing_in_en=$(comm -23 <(echo "$fr_keys") <(echo "$en_keys"))
  missing_in_fr=$(comm -13 <(echo "$fr_keys") <(echo "$en_keys"))
  if [ -n "$missing_in_en" ] || [ -n "$missing_in_fr" ]; then
    [ -n "$missing_in_en" ] && echo "Missing in en.json:" && echo "$missing_in_en"
    [ -n "$missing_in_fr" ] && echo "Missing in fr.json:" && echo "$missing_in_fr"
    exit 1
  fi
'

run "Validate top-level JSON sources (jq empty)" bash -c '
  for f in lib/data.default.json lib/data/config.json lib/data/thresholds.json \
           lib/data/seasons.json lib/data/items.json lib/data/berries.json \
           lib/data/special/*.json lib/data/lineages/*.json \
           lib/data/wild_pool/*.json lib/locales/fr.json lib/locales/en.json; do
    jq empty "$f" || exit 1
  done
'

run "shellcheck (errors only) on maintainer scripts" bash -c '
  if ! command -v shellcheck >/dev/null 2>&1; then
    echo "  (shellcheck not installed locally, skipping — CI still enforces it)"
    exit 0
  fi
  # Runtime is bash-free (R3d-6); only the maintainer build scripts remain.
  shellcheck -S error scripts/build-data.sh scripts/build-sprites.sh scripts/ci-pre-push.sh
'

run "Node-native CLI entrypoints syntax-check" bash -c '
  for f in install update uninstall status export import; do node --check "bin/$f.mjs"; done
  node --check bin/claude-pokemon
'

run "lib/data.default.json is in sync with lib/data/** sources" bash -c '
  bash scripts/build-data.sh >/dev/null
  if ! git diff --exit-code --quiet lib/data.default.json; then
    echo "  ::error:: data.default.json is stale. Run \`npm run build:data\` and stage the result."
    git --no-pager diff --stat lib/data.default.json
    exit 1
  fi
'

run "shared generated data + engine bundle in sync" bash -c '
  npm run -s -w shared build:gen >/dev/null
  npm run -s -w shared build >/dev/null
  npm run -s -w cli build:engine >/dev/null
  if ! git diff --exit-code --quiet \
      shared/src/species-combat-type.generated.ts shared/src/learnsets.generated.ts lib/statusline.mjs lib/pokemon.mjs; then
    echo "  ::error:: shared generated data / engine bundles stale. Run \`npm run build:data\` and stage the result."
    git --no-pager diff --stat \
      shared/src/species-combat-type.generated.ts shared/src/learnsets.generated.ts lib/statusline.mjs lib/pokemon.mjs
    exit 1
  fi
'

run "shared : ESLint"           npm run -s -w shared lint
run "shared : Prettier check"   npm run -s -w shared format:check
run "shared : TypeScript check" npm run -s -w shared typecheck
run "shared : Vitest (coverage)" npm run -s -w shared test:coverage

run "cli : ESLint"           npm run -s -w cli lint
run "cli : Prettier check"   npm run -s -w cli format:check
run "cli : TypeScript check" npm run -s -w cli typecheck
run "cli : Vitest (coverage)" npm run -s -w cli test:coverage

run "api : ESLint"           npm run -s -w api lint
run "api : Prettier check"   npm run -s -w api format:check
run "api : TypeScript check" npm run -s -w api typecheck
run "api : Vitest"           npm run -s -w api test

# The bats suite and the web workspace were missing here while CI ran them
# (jobs `cli-tests` and `web-*`). A change touching the render fixtures, the
# golden snapshots or a web lineage/badge map therefore passed the pre-push
# hook and went red on GitHub — exactly what "local CI mirror" must prevent.
run "cli : bats (fixtures + goldens)" npm test

run "web : ESLint"           npm run -s -w web lint
run "web : Prettier check"   npm run -s -w web format:check
run "web : TypeScript check" npm run -s -w web typecheck
run "web : Vitest"           npm run -s -w web test

echo
if [ "$fails" -gt 0 ]; then
  printf '\033[31m✗ %d gate(s) failed.\033[0m Push aborted.\n' "$fails"
  echo 'To bypass in emergencies: git push --no-verify'
  exit 1
fi
printf '\033[32m✓ All CI gates green.\033[0m\n'
