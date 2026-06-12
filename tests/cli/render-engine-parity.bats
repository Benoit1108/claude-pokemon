#!/usr/bin/env bats
# View-render fixtures (Phase R3c; retargeted onto the real entrypoint in the
# audit cleanup). For every (scenario × view), runs `node lib/pokemon.mjs <view>`
# against a scenario state and asserts the ANSI-stripped output is byte-identical
# to the frozen R3a fixture. These fixtures ARE the golden contract for the view
# layouts (rich/edge branches + recap + statusline live in golden-node.bats; the
# engine logic in the shared vitest).
#
# Scenario states come from tests/render/scenarios.sh.

load '../helpers/setup.bash'

VIEWS=(badges inventory team pc stats pokedex main trainer-card recap)

strip_ansi_file() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

@test "pokemon.mjs renders byte-identical to the frozen fixtures (all views)" {
  local tmp fails=0
  tmp=$(mktemp -d)
  local PD="$tmp/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/pokemon.mjs" "$PD/pokemon.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  jq '.language="fr" | .display_sprite_in_statusline="off"' \
    "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"

  # shellcheck source=../render/scenarios.sh
  source "$REPO_ROOT/tests/render/scenarios.sh"

  for scenario in "${!RENDER_SCENARIOS[@]}"; do
    for view in "${VIEWS[@]}"; do
      render_write_state "${RENDER_SCENARIOS[$scenario]}" "$PD/state.json"
      local fixture arg
      fixture="$REPO_ROOT/tests/render/fixtures/${scenario}__${view}.txt"
      arg="$view"; [ "$view" = "main" ] && arg=""   # main = default view
      # shellcheck disable=SC2086
      POKEMON_DIR="$PD" node "$PD/pokemon.mjs" $arg 2>/dev/null | strip_ansi_file > "$tmp/got.txt"
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
