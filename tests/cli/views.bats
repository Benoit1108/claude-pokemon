#!/usr/bin/env bats
# Smoke tests for the read-only views of pokemon-status.sh.
# Each runs against an isolated POKEMON_DIR seeded with a Lv.5 fire trainer.

load '../helpers/setup.bash'

setup() {
  seed_pokemon_dir fire 5 650000
}

teardown() {
  cleanup_pokemon_dir
}

@test "view_main (no arg) renders the COMPAGNON frame" {
  run bash "$POKEMON_STATUS_SH"
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"COMPAGNON"* ]]
}

@test "team view shows the ÉQUIPE header" {
  run bash "$POKEMON_STATUS_SH" team
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"ÉQUIPE"* ]]
}

@test "pc view shows the PC STORAGE header" {
  run bash "$POKEMON_STATUS_SH" pc
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"PC STORAGE"* ]]
}

@test "pokedex view shows the POKÉDEX header" {
  run bash "$POKEMON_STATUS_SH" pokedex
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"POKÉDEX"* ]]
}

@test "stats view shows STATISTIQUES header" {
  run bash "$POKEMON_STATUS_SH" stats
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"STATISTIQUES"* ]]
}

@test "badges view shows BADGES header" {
  run bash "$POKEMON_STATUS_SH" badges
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"BADGES"* ]]
}

@test "inventory view shows INVENTAIRE header" {
  run bash "$POKEMON_STATUS_SH" inventory
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"INVENTAIRE"* ]]
}

@test "recap view shows RECAP DE SESSION header" {
  run bash "$POKEMON_STATUS_SH" recap
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"RECAP DE SESSION"* ]]
}

@test "trainer-card view runs without error" {
  run bash "$POKEMON_STATUS_SH" trainer-card
  [ "$status" -eq 0 ]
}

@test "aggregate view shows STATS GLOBALES" {
  run bash "$POKEMON_STATUS_SH" aggregate
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"STATS GLOBALES"* ]]
}

@test "unknown subcommand falls back to view_main (no crash)" {
  run bash "$POKEMON_STATUS_SH" definitely_not_a_real_subcommand
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"COMPAGNON"* ]]
}
