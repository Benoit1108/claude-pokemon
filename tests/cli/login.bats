#!/usr/bin/env bats
# Phase R2d — `pokemon login` / `logout`. The GitHub device flow itself needs
# the network + a real authorization, so it's manual-tested ; here we cover the
# offline guard paths (no endpoint configured, logout when not logged in).

load '../helpers/setup.bash'

setup() {
  seed_pokemon_dir fire 5 650000
}

teardown() {
  cleanup_pokemon_dir
}

@test "login aborts cleanly when no API endpoint is configured" {
  jq '.stats_share.endpoint = ""' "$POKEMON_DIR/data.json" > "$POKEMON_DIR/data.json.tmp"
  mv "$POKEMON_DIR/data.json.tmp" "$POKEMON_DIR/data.json"

  run bash "$POKEMON_STATUS_SH" login
  [ "$status" -ne 0 ]
  [[ "$output" == *"endpoint"* ]]
}

@test "logout is a no-op when not logged in" {
  run bash "$POKEMON_STATUS_SH" logout
  [ "$status" -eq 0 ]
  [[ "$output" == *"Not logged in"* ]]
}

@test "logout clears the session file + reports success" {
  printf 'deadbeef' > "$POKEMON_DIR/.session"
  # No endpoint → skip the network revocation, just clear locally.
  jq '.stats_share.endpoint = ""' "$POKEMON_DIR/data.json" > "$POKEMON_DIR/data.json.tmp"
  mv "$POKEMON_DIR/data.json.tmp" "$POKEMON_DIR/data.json"

  run bash "$POKEMON_STATUS_SH" logout
  [ "$status" -eq 0 ]
  [[ "$output" == *"Logged out"* ]]
  [ ! -f "$POKEMON_DIR/.session" ]
}
