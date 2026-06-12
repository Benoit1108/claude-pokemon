#!/usr/bin/env bats
# Native Node install tooling (Phase R3d-5 piece 4). install/update/uninstall/
# status .mjs are the Windows-native (bash-free) equivalents of the bin/*.sh
# scripts. Run them against a throwaway HOME and assert the structural outcome:
# files copied, state/data initialised, statusLine registered to the NODE
# entrypoint, idempotency, migration, and clean uninstall.

load '../helpers/setup.bash'

setup_node_install() {
  TD="$(mktemp -d)"; export HOME="$TD"
  export CLAUDE_POKEMON_ROOT="$REPO_ROOT"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }

@test "install.mjs sets up the Node-native runtime + statusLine" {
  setup_node_install
  run node "$REPO_ROOT/bin/install.mjs"
  [ "$status" -eq 0 ]
  for f in engine.mjs statusline.mjs pokemon.mjs data.json state.json locales/fr.json locales/en.json; do
    [ -f "$TD/.claude/pokemon/$f" ] || { echo "missing $f"; false; }
  done
  [ -f "$TD/.claude/pokemon/sprites/normal/charmander.txt" ]
  [ -f "$TD/.claude/pokemon/sprites-mini/shiny/pikachu.txt" ]
  [ -f "$TD/.claude/skills/pokemon/SKILL.md" ]
  # statusLine registered to the Node entrypoint.
  cmd=$(jq -r '.statusLine.command' "$TD/.claude/settings.json")
  [[ "$cmd" == node* ]]
  [[ "$cmd" == *statusline.mjs ]]
  # state.json is a fresh egg, valid JSON.
  [ "$(jq -r '.current_level' "$TD/.claude/pokemon/state.json")" = "0" ]
  [ "$(jq -r '.enable_animations' "$TD/.claude/pokemon/data.json")" = "false" ]
}

@test "install.mjs is idempotent (preserves state.json)" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  jq '.current_level=42 | .lineage="fire"' "$TD/.claude/pokemon/state.json" > "$TD/s.tmp"
  mv "$TD/s.tmp" "$TD/.claude/pokemon/state.json"
  run node "$REPO_ROOT/bin/install.mjs"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.current_level' "$TD/.claude/pokemon/state.json")" = "42" ]
  # settings.json backup created on re-install.
  ls "$TD/.claude/settings.json.bak-pokemon-"* >/dev/null
}

@test "install.mjs backs up an existing settings.json + keeps other keys" {
  setup_node_install
  mkdir -p "$TD/.claude"
  echo '{"theme":"dark","statusLine":{"type":"command","command":"old"}}' > "$TD/.claude/settings.json"
  run node "$REPO_ROOT/bin/install.mjs"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.theme' "$TD/.claude/settings.json")" = "dark" ]
  [[ "$(jq -r '.statusLine.command' "$TD/.claude/settings.json")" == *statusline.mjs ]]
}

@test "update.mjs migrates data.json (force thresholds/version/wild_pool) + preserves state" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  jq '.current_level=50' "$TD/.claude/pokemon/state.json" > "$TD/s.tmp"; mv "$TD/s.tmp" "$TD/.claude/pokemon/state.json"
  # User mangles thresholds + adds a custom key; update must reset thresholds, keep the custom key.
  jq '.thresholds=[0,1] | .my_custom="keep"' "$TD/.claude/pokemon/data.json" > "$TD/d.tmp"; mv "$TD/d.tmp" "$TD/.claude/pokemon/data.json"
  run node "$REPO_ROOT/bin/update.mjs"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.current_level' "$TD/.claude/pokemon/state.json")" = "50" ]   # preserved
  [ "$(jq -r '.my_custom' "$TD/.claude/pokemon/data.json")" = "keep" ]      # custom preserved
  [ "$(jq -r '.thresholds | length' "$TD/.claude/pokemon/data.json")" -gt 2 ] # reset from default
}

@test "status.mjs reports the install + statusLine" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  run node "$REPO_ROOT/bin/status.mjs"
  [ "$status" -eq 0 ]
  [[ "$output" == *"statusline.mjs"* ]]
  [[ "$output" == *"sprites pré-rendus"* ]]
}

@test "uninstall.mjs --confirm removes the install + statusLine (with backups)" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  run node "$REPO_ROOT/bin/uninstall.mjs" --confirm
  [ "$status" -eq 0 ]
  [ ! -d "$TD/.claude/pokemon" ]
  [ "$(jq -r '.statusLine // "gone"' "$TD/.claude/settings.json")" = "gone" ]
  ls "$TD/.claude/backups/pokemon-"* >/dev/null
}

@test "uninstall.mjs without --confirm is a no-op" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  run node "$REPO_ROOT/bin/uninstall.mjs"
  [ "$status" -eq 0 ]
  [ -d "$TD/.claude/pokemon" ]
}
