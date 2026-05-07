#!/usr/bin/env bats
# Smoke tests for /pokemon bio + /pokemon pins (Sprint 2.9).

load '../helpers/setup.bash'

setup() {
  seed_pokemon_dir fire 5 650000
  # Seed some owned badges for pins tests.
  jq '.badges = [
    {"id":"hatch","earned_at":"2026-05-07T00:00:00Z"},
    {"id":"first_evolution","earned_at":"2026-05-07T00:00:00Z"},
    {"id":"first_shiny","earned_at":"2026-05-07T00:00:00Z"}
  ]' "$POKEMON_DIR/state.json" > "$POKEMON_DIR/state.json.tmp"
  mv "$POKEMON_DIR/state.json.tmp" "$POKEMON_DIR/state.json"
}

teardown() {
  cleanup_pokemon_dir
}

# ---------------------------------------------------------------------------
# bio
# ---------------------------------------------------------------------------

@test "bio (no arg) shows the unset prompt by default" {
  run bash "$POKEMON_STATUS_SH" bio
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"BIO"* ]]
}

@test "bio <text> saves the bio in data.json" {
  run bash "$POKEMON_STATUS_SH" bio "Dresseur de Salamèche depuis 2026."
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.bio' "$POKEMON_DIR/data.json")
  [ "$saved" = "Dresseur de Salamèche depuis 2026." ]
}

@test "bio with multiple args joins them with newlines" {
  run bash "$POKEMON_STATUS_SH" bio "Line one." "Line two." "Line three."
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.bio' "$POKEMON_DIR/data.json")
  expected=$'Line one.\nLine two.\nLine three.'
  [ "$saved" = "$expected" ]
}

@test "bio rejects more than 4 lines" {
  run bash "$POKEMON_STATUS_SH" bio "L1" "L2" "L3" "L4" "L5"
  [ "$status" -eq 0 ]  # graceful exit, not crash
  out=$(strip_ansi "$output")
  [[ "$out" == *"4"* ]]
  saved=$(jq -r '.stats_share.bio' "$POKEMON_DIR/data.json")
  [ "$saved" = "null" ]  # not persisted
}

@test "bio rejects strings longer than 160 chars" {
  long=$(printf 'a%.0s' {1..161})
  run bash "$POKEMON_STATUS_SH" bio "$long"
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"161"* ]]
  saved=$(jq -r '.stats_share.bio' "$POKEMON_DIR/data.json")
  [ "$saved" = "null" ]
}

@test "bio clear removes a previously set bio" {
  bash "$POKEMON_STATUS_SH" bio "Test bio" >/dev/null
  run bash "$POKEMON_STATUS_SH" bio clear
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.bio' "$POKEMON_DIR/data.json")
  [ "$saved" = "null" ]
}

# ---------------------------------------------------------------------------
# pins
# ---------------------------------------------------------------------------

@test "pins (no arg) shows the unset prompt + owned badges" {
  run bash "$POKEMON_STATUS_SH" pins
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"BADGES"* ]]
  [[ "$out" == *"hatch"* ]]
}

@test "pins set persists the requested badges" {
  run bash "$POKEMON_STATUS_SH" pins set hatch,first_evolution
  [ "$status" -eq 0 ]
  saved=$(jq -c '.stats_share.pinned_badges' "$POKEMON_DIR/data.json")
  [ "$saved" = '["hatch","first_evolution"]' ]
}

@test "pins set accepts space-separated args too" {
  run bash "$POKEMON_STATUS_SH" pins set hatch first_evolution first_shiny
  [ "$status" -eq 0 ]
  saved=$(jq -c '.stats_share.pinned_badges' "$POKEMON_DIR/data.json")
  [ "$saved" = '["hatch","first_evolution","first_shiny"]' ]
}

@test "pins set rejects more than 3 badges" {
  run bash "$POKEMON_STATUS_SH" pins set hatch first_evolution first_shiny extra
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"3"* ]] || [[ "$out" == *"Trop"* ]]
  saved=$(jq -c '.stats_share.pinned_badges' "$POKEMON_DIR/data.json")
  [ "$saved" = '[]' ]
}

@test "pins set rejects badges the user does not own" {
  run bash "$POKEMON_STATUS_SH" pins set hatch,centurion
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"centurion"* ]]
  saved=$(jq -c '.stats_share.pinned_badges' "$POKEMON_DIR/data.json")
  [ "$saved" = '[]' ]
}

@test "pins clear removes previously set pins" {
  bash "$POKEMON_STATUS_SH" pins set hatch,first_evolution >/dev/null
  run bash "$POKEMON_STATUS_SH" pins clear
  [ "$status" -eq 0 ]
  saved=$(jq -c '.stats_share.pinned_badges' "$POKEMON_DIR/data.json")
  [ "$saved" = '[]' ]
}
