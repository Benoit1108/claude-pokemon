#!/usr/bin/env bats
# Smoke tests for /pokemon quote subcommand (Sprint 2.8a).

load '../helpers/setup.bash'

setup() {
  seed_pokemon_dir fire 5 650000
}

teardown() {
  cleanup_pokemon_dir
}

@test "quote (no arg) shows the unset prompt by default" {
  run bash "$POKEMON_STATUS_SH" quote
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"CITATION"* ]] || [[ "$out" == *"QUOTE"* ]]
}

@test "quote <text> saves the quote in data.json" {
  run bash "$POKEMON_STATUS_SH" quote "Catch 'em all!"
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.quote' "$POKEMON_DIR/data.json")
  [ "$saved" = "Catch 'em all!" ]
}

@test "quote (no arg) shows the saved quote after setting" {
  bash "$POKEMON_STATUS_SH" quote "Pikachu power" >/dev/null
  run bash "$POKEMON_STATUS_SH" quote
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"Pikachu power"* ]]
}

@test "quote with multi-word input concatenates all args" {
  run bash "$POKEMON_STATUS_SH" quote Mon Salamèche est le plus fort
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.quote' "$POKEMON_DIR/data.json")
  [ "$saved" = "Mon Salamèche est le plus fort" ]
}

@test "quote clear nullifies the saved quote" {
  bash "$POKEMON_STATUS_SH" quote "Will be removed" >/dev/null
  run bash "$POKEMON_STATUS_SH" quote clear
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.quote // "null"' "$POKEMON_DIR/data.json")
  [ "$saved" = "null" ]
}

@test "quote rejects input longer than 80 chars" {
  long_text=$(printf 'a%.0s' {1..81})
  run bash "$POKEMON_STATUS_SH" quote "$long_text"
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"80"* ]] || [[ "$out" == *"max"* ]] || [[ "$out" == *"Trop"* ]] || [[ "$out" == *"Too"* ]]
  # Quote should NOT be saved.
  saved=$(jq -r '.stats_share.quote // "null"' "$POKEMON_DIR/data.json")
  [ "$saved" = "null" ]
}

@test "quote at exactly 80 chars is accepted" {
  exact_text=$(printf 'a%.0s' {1..80})
  run bash "$POKEMON_STATUS_SH" quote "$exact_text"
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.quote' "$POKEMON_DIR/data.json")
  [ "$saved" = "$exact_text" ]
}
