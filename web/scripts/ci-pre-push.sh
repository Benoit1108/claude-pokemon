#!/usr/bin/env bash
# Mirrors .github/workflows/ci.yml so a green local run means a green CI run.
# Wired up as a Husky pre-push hook (.husky/pre-push) — also re-runnable
# manually via `npm run ci:pre-push`. Skip in emergencies : `git push --no-verify`.
#
# Order is "cheap-and-fast first" so unrelated issues fail early :
#   1. ESLint   (~3s)
#   2. Prettier (~2s)
#   3. Vitest   (~5s)
#   4. Nuxt build with cloudflare-pages preset (~25s) — slowest, last
#
# Typecheck is NOT in this hook (nuxt typecheck exits 0 but spams plugin
# warnings ; we cover types via the build step which fails on real errors).
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

run "ESLint"         npm run -s lint
run "Prettier check" npm run -s format:check

# Nuxt typecheck swallows the underlying vue-tsc exit code locally — exits 0
# even when there are real TS errors. CI catches it on a different exit path.
# We work around it by capturing output and failing on the error string.
run "Nuxt typecheck" bash -c '
  out=$(npm run -s typecheck 2>&1)
  echo "$out"
  if echo "$out" | grep -qE "(error TS[0-9]+|Process exited with non-zero status)"; then
    exit 1
  fi
'

run "Dead code (knip)"          npm run -s knip
run "i18n FR/EN key parity"     npm run -s check:i18n
run "Vitest"                    npm run -s test
run "Nuxt build (cloudflare-pages preset)" env NITRO_PRESET=cloudflare-pages npm run -s build

echo
if [ "$fails" -gt 0 ]; then
  printf '\033[31m✗ %d gate(s) failed.\033[0m Push aborted.\n' "$fails"
  echo 'To bypass in emergencies: git push --no-verify'
  exit 1
fi
printf '\033[32m✓ All CI gates green.\033[0m\n'
