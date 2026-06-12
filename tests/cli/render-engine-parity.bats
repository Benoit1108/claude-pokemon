#!/usr/bin/env bats
# TS engine render parity (Phase R3c; trimmed in R3d-6 after bash removal).
#
# For every (scenario × view), runs the engine's `render` command and asserts
# its ANSI-stripped output is byte-identical to the frozen R3a fixture. These
# fixtures ARE the golden contract for the view layouts now that bash is gone
# (the rich/edge branches + recap + statusline are covered by golden-node.bats;
# the engine logic by the shared vitest).
#
# Scenario states come from tests/render/scenarios.sh.

load '../helpers/setup.bash'

VIEWS=(badges inventory team pc stats pokedex main trainer-card recap)

strip_ansi_file() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

@test "engine render is byte-identical to the frozen fixtures (all views)" {
  local engine="$REPO_ROOT/lib/engine.mjs"
  local data locale tmp fails=0
  data=$(cat "$REPO_ROOT/lib/data.default.json")
  locale=$(cat "$REPO_ROOT/lib/locales/fr.json")
  tmp=$(mktemp -d)

  # shellcheck source=../render/scenarios.sh
  source "$REPO_ROOT/tests/render/scenarios.sh"

  for scenario in "${!RENDER_SCENARIOS[@]}"; do
    render_write_state "${RENDER_SCENARIOS[$scenario]}" "$tmp/state.json"
    local state
    state=$(cat "$tmp/state.json")
    for view in "${VIEWS[@]}"; do
      local req fixture
      fixture="$REPO_ROOT/tests/render/fixtures/${scenario}__${view}.txt"
      req=$(jq -cn --argjson s "$state" --argjson d "$data" --argjson l "$locale" --arg v "$view" \
        '{view: $v, state: $s, data: $d, locale: $l, lang: "fr", scriptName: "pokemon-status.sh"}')
      printf '%s' "$req" | node "$engine" render "$view" 2>/dev/null | strip_ansi_file > "$tmp/got.txt"
      if ! diff -q "$fixture" "$tmp/got.txt" >/dev/null; then
        echo "MISMATCH ${scenario}__${view}:"
        diff "$fixture" "$tmp/got.txt" || true
        fails=$((fails + 1))
      fi
    done
  done
  rm -rf "$tmp"
  [ "$fails" -eq 0 ]
}

@test "engine render exits 3 for an unknown view (legacy fallback signal)" {
  run bash -c "printf '%s' '{\"view\":\"switch\",\"state\":{},\"data\":{},\"locale\":{}}' | node '$REPO_ROOT/lib/engine.mjs' render switch"
  [ "$status" -eq 3 ]
}

@test "the positional <view> is authoritative over a stdin view" {
  run bash -c "printf '%s' '{\"view\":\"team\",\"state\":{\"badges\":[]},\"data\":{},\"locale\":{}}' | node '$REPO_ROOT/lib/engine.mjs' render badges"
  [ "$status" -eq 0 ]
  [[ "$output" == *"badges.title"* ]]
}
