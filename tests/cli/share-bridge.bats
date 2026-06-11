#!/usr/bin/env bats
# stats-share config-subcommand bridge (Phase R3d-4b). status/enable/disable/
# name run via the engine `share` command; forget/submit (network) fall back to
# bash. Deterministic subs are diffed byte-exact vs the bash fallback; enable
# (random anon_id) is checked structurally.

load '../helpers/setup.bash'

setup_share() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  STATUS="$TD/.claude/pokemon-status.sh"
  echo '{"version":2,"lineage":"fire","current_level":5,"badges":[],"lifetime_stats":{}}' > "$PD/state.json"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }
strip() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }
# $1 = the stats_share JSON to seed; rest = the subcommand args.
seed_share() { jq --argjson ss "$1" '.language="fr" | .stats_share=$ss' "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"; }

share_diff() {
  local ss="$1"; shift
  seed_share "$ss"
  local e_out e_share
  e_out=$(bash "$STATUS" stats-share "$@" 2>/dev/null | strip)
  e_share=$(jq -S '.stats_share' "$PD/data.json")
  seed_share "$ss"
  local b_out b_share
  b_out=$(POKEMON_ENGINE=/nope/e.mjs bash "$STATUS" stats-share "$@" 2>/dev/null | strip)
  b_share=$(jq -S '.stats_share' "$PD/data.json")
  [ "$e_share" = "$b_share" ] || { echo "SHARE DIFF ($*):"; diff <(echo "$b_share") <(echo "$e_share"); return 1; }
  [ "$e_out" = "$b_out" ] || { echo "STDOUT DIFF ($*):"; diff <(echo "$b_out") <(echo "$e_out"); return 1; }
}

EN='{"enabled":true,"anon_id":"abcd1234","endpoint":"https://x","display_name":"Sacha"}'
OFF='{"enabled":false,"endpoint":"https://x"}'

@test "status (enabled)" { setup_share; share_diff "$EN" status; }
@test "status (disabled)" { setup_share; share_diff "$OFF" status; }
@test "status default (no arg)" { setup_share; share_diff "$EN"; }
@test "enable without --confirm shows privacy notice" { setup_share; share_diff "$OFF" enable; }
@test "enable when already enabled" { setup_share; share_diff "$EN" enable --confirm; }
@test "disable" { setup_share; share_diff "$EN" disable; }
@test "disable when already disabled" { setup_share; share_diff "$OFF" disable; }
@test "name set valid" { setup_share; share_diff "$EN" name Ash_2024; }
@test "name set invalid (rejected)" { setup_share; share_diff "$EN" name "a"; }
@test "name clear" { setup_share; share_diff "$EN" name clear; }
@test "name show (no arg)" { setup_share; share_diff "$EN" name; }

@test "enable --confirm generates an 8-hex anon_id + enables (structure)" {
  setup_share
  seed_share "$OFF"
  run bash "$STATUS" stats-share enable --confirm
  [ "$status" -eq 0 ]
  [ "$(jq -r '.stats_share.enabled' "$PD/data.json")" = "true" ]
  local id; id=$(jq -r '.stats_share.anon_id' "$PD/data.json")
  [[ "$id" =~ ^[0-9a-f]{8}$ ]]
  [[ "$(echo "$output" | strip)" == *"$id"* ]]
}

@test "forget falls back to bash (engine exits 3 for network subs)" {
  setup_share
  seed_share "$EN"
  # No network here; just assert the engine didn't hijack it and bash ran
  # (engine `share forget` exits 3 → fallback). Output is non-empty.
  run bash "$STATUS" stats-share forget
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}
