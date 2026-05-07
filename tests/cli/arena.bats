#!/usr/bin/env bats
# Smoke tests for /pokemon arena subcommands.
# We test the CLI shape (dispatch + locale strings + state mutations) without
# hitting the real Worker — the offline-first commands (status, enable without
# --confirm, opponents with no endpoint) are the meaningful coverage.

load '../helpers/setup.bash'

setup() {
  seed_pokemon_dir fire 5 650000
}

teardown() {
  cleanup_pokemon_dir
}

@test "arena status shows the ARENA header" {
  run bash "$POKEMON_STATUS_SH" arena status
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"ARENA"* ]]
}

@test "arena status (no arg) defaults to status" {
  run bash "$POKEMON_STATUS_SH" arena
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"ARENA"* ]]
}

@test "arena enable without --confirm shows the privacy notice" {
  # Pre-populate stats_share.anon_id so the no_anon_id branch isn't taken.
  jq '.stats_share.anon_id = "deadbeef"' "$POKEMON_DIR/data.json" > "$POKEMON_DIR/data.json.tmp"
  mv "$POKEMON_DIR/data.json.tmp" "$POKEMON_DIR/data.json"

  run bash "$POKEMON_STATUS_SH" arena enable
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"envoyé"* ]] || [[ "$out" == *"sent"* ]]
}

@test "arena enable without anon_id directs to stats-share enable first" {
  # Default seed has no stats_share.anon_id.
  run bash "$POKEMON_STATUS_SH" arena enable --confirm
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"anon_id"* ]] || [[ "$out" == *"stats-share"* ]]
}

@test "arena disable when not enabled is a no-op" {
  run bash "$POKEMON_STATUS_SH" arena disable
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"Déjà désactivée"* ]] || [[ "$out" == *"Already disabled"* ]]
}

@test "arena challenge without target shows usage" {
  run bash "$POKEMON_STATUS_SH" arena challenge
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"Usage"* ]] || [[ "$out" == *"challenge"* ]]
}

@test "arena battle without id and no last_battle_id shows usage" {
  run bash "$POKEMON_STATUS_SH" arena battle
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"Usage"* ]] || [[ "$out" == *"battle"* ]]
}

@test "arena unknown subcommand prints the localized error" {
  run bash "$POKEMON_STATUS_SH" arena bogus_cmd
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"inconnue"* ]] || [[ "$out" == *"Unknown"* ]]
}

@test "arena regenerate without prior enable warns" {
  run bash "$POKEMON_STATUS_SH" arena regenerate
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  # Either "not enabled" or the no_secret branch — both are valid early-exits.
  [[ "$out" == *"non activée"* ]] || [[ "$out" == *"not enabled"* ]] || [[ "$out" == *"secret"* ]]
}
