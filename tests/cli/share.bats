#!/usr/bin/env bats
# Smoke tests for /pokemon stats-share subcommands.

load '../helpers/setup.bash'

setup() {
  seed_pokemon_dir fire 5 650000
}

teardown() {
  cleanup_pokemon_dir
}

@test "stats-share status (default) shows the share header" {
  run bash "$POKEMON_STATUS_SH" stats-share status
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"STATS PARTAGÉES"* ]] || [[ "$out" == *"SHARED STATS"* ]]
}

@test "share alias works the same as stats-share" {
  run bash "$POKEMON_STATUS_SH" share status
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"STATS PARTAGÉES"* ]] || [[ "$out" == *"SHARED STATS"* ]]
}

@test "stats-share enable without --confirm shows the privacy notice" {
  run bash "$POKEMON_STATUS_SH" stats-share enable
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"envoyé"* ]] || [[ "$out" == *"sent"* ]]
}

@test "stats-share name (no arg) shows current pseudo state" {
  run bash "$POKEMON_STATUS_SH" stats-share name
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"pseudo"* ]] || [[ "$out" == *"name"* ]]
}

@test "stats-share name with invalid pseudo rejects" {
  run bash "$POKEMON_STATUS_SH" stats-share name "bad space!"
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"Invalid"* ]] || [[ "$out" == *"invalide"* ]]
}

@test "stats-share name with valid pseudo writes data.json" {
  run bash "$POKEMON_STATUS_SH" stats-share name "test_user"
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.display_name' "$POKEMON_DIR/data.json")
  [ "$saved" = "test_user" ]
}

@test "stats-share name clear nullifies the pseudo" {
  jq '.stats_share.display_name = "old_name"' "$POKEMON_DIR/data.json" > "$POKEMON_DIR/data.json.tmp"
  mv "$POKEMON_DIR/data.json.tmp" "$POKEMON_DIR/data.json"

  run bash "$POKEMON_STATUS_SH" stats-share name clear
  [ "$status" -eq 0 ]
  saved=$(jq -r '.stats_share.display_name // "null"' "$POKEMON_DIR/data.json")
  [ "$saved" = "null" ]
}

@test "stats-share unknown subcommand prints localized error" {
  run bash "$POKEMON_STATUS_SH" stats-share bogus_cmd
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"inconnue"* ]] || [[ "$out" == *"Unknown"* ]]
}
