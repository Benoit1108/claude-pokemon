#!/usr/bin/env bats
# TS engine bridge (Phase R3b).
#
# The bash CLI now consumes the shared TypeScript rules engine (bundled into
# lib/engine.mjs) for its XP/level/multiplier derivations, with a bash fallback.
# These tests assert two contracts:
#   1. The engine's `derive` output is byte-identical to the pure bash leaf
#      functions (which the R0 goldens freeze) across a representative matrix.
#   2. The tick degrades gracefully to the bash path when node / the bundle is
#      unavailable, still producing a valid state.

load '../helpers/setup.bash'

# Hermetic data/state dir; source the REPO lib.sh so engine.mjs resolves next
# to it (BASH_SOURCE dir). $1 = lineage, $2 = total_xp.
setup_engine_env() {
  WORK="$(mktemp -d)"
  cp "$REPO_ROOT/lib/data.default.json" "$WORK/data.json"
  cat > "$WORK/state.json" <<EOF
{ "version": 2, "lineage": "${1:-fire}", "is_shiny": false, "current_level": 1,
  "total_xp": ${2:-0}, "eevee_form": null, "lifetime_stats": {"total_shinies": 0} }
EOF
  export POKEMON_DIR="$WORK"
}

teardown() {
  [ -n "${WORK:-}" ] && rm -rf "$WORK"
}

@test "engine bundle exists and answers a derive request" {
  setup_engine_env fire 2000000
  th=$(jq -c '.thresholds' "$WORK/data.json")
  run bash -c "printf '%s' '{\"thresholds\":$th,\"total_xp\":2000000,\"lineage\":\"fire\",\"used_pct\":20}' | node '$REPO_ROOT/lib/engine.mjs' derive"
  [ "$status" -eq 0 ]
  [ "$(printf '%s' "$output" | jq -r '.level')" = "5" ]
  [ "$(printf '%s' "$output" | jq -r '.xp_multiplier')" = "2.0" ]
}

@test "engine derive matches the bash leaf functions across a matrix" {
  setup_engine_env fire 0
  source "$REPO_ROOT/lib/lib.sh"
  # Hard assert the engine is live — otherwise pokemon_engine_derive returns 1,
  # $d is empty, and the matrix below silently degrades to bash-vs-bash ("").
  pokemon_engine_available || { echo "engine unavailable — parity test would be a tautology"; false; }

  # (lineage, total_xp, used_pct) cases spanning multiplier tiers + levels.
  local cases=(
    "fire 0 10" "fire 2000000 20" "fire 50000000 40"
    "water 12000000 80" "water 12000000 50"
    "grass 8000000 50" "grass 8000000 90"
    "electric 30000000 75" "eevee 60000000 25"
    "totodile 5000000 100" "chikorita 1998000 0"
  )
  for c in "${cases[@]}"; do
    set -- $c
    local lin="$1" xp="$2" pct="$3"
    local d lvl
    d=$(pokemon_engine_derive "$xp" "$lin" "$pct")
    lvl=$(jq -r '.level' <<<"$d")

    [ "$lvl" = "$(pokemon_compute_level_from_xp "$xp")" ]
    [ "$(jq -r '.threshold' <<<"$d")"       = "$(pokemon_threshold "$lvl")" ]
    [ "$(jq -r '.xp_to_next' <<<"$d")"      = "$(pokemon_xp_to_next "$xp" "$lvl")" ]
    [ "$(jq -r '.progress_pct' <<<"$d")"    = "$(pokemon_progress_pct "$xp" "$lvl")" ]
    [ "$(jq -r '.xp_multiplier' <<<"$d")"   = "$(pokemon_xp_multiplier "$pct")" ]
    [ "$(jq -r '.type_match_mult' <<<"$d")" = "$(pokemon_type_match_mult "$lin" "$pct")" ]
  done
}

@test "engine handles null used_pct (neutral multipliers) like bash" {
  setup_engine_env fire 2000000
  source "$REPO_ROOT/lib/lib.sh"
  d=$(pokemon_engine_derive 2000000 fire "")
  [ "$(jq -r '.xp_multiplier' <<<"$d")" = "$(pokemon_xp_multiplier "")" ]
}

@test "tick falls back to bash when the engine is unavailable" {
  WORK="$(mktemp -d)"
  cp "$REPO_ROOT/lib/data.default.json" "$WORK/data.json"
  cat > "$WORK/state.json" <<'EOF'
{ "version": 2, "lineage": "fire", "is_shiny": false, "current_level": 5,
  "total_xp": 2000000, "evolution_history": [], "evolution_flash_remaining": 0,
  "sessions": {}, "badges": [], "team": [], "pc_storage": [], "pokedex": {},
  "lifetime_stats": { "total_tokens": 0, "total_shinies": 0, "max_level": 5,
    "lineages_completed": [] }, "created_at": "2026-05-07T00:00:00Z" }
EOF
  POKEMON_ENGINE="/nonexistent/engine.mjs" run bash -c "
    export POKEMON_DIR='$WORK' POKEMON_ENGINE='/nonexistent/engine.mjs'
    source '$REPO_ROOT/lib/lib.sh'
    pokemon_engine_available && exit 99   # must report unavailable
    pokemon_tick s 50000 20 2>/dev/null
    jq -r '.last_xp_multipliers.context' '$WORK/state.json'
  "
  [ "$status" -eq 0 ]
  [ "$output" = "2.0" ]   # bash fallback produced the same multiplier
}
