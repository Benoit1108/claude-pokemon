#!/usr/bin/env bats
# Trainer-profile config bridge (Phase R3d-4b): quote / bio / pins now run via
# the engine `config` command (validate + mutate data.json + render), with a
# bash fallback. These are deterministic, so we diff the engine path against the
# bash fallback from the same seed: resulting stats_share + stdout must match.

load '../helpers/setup.bash'

setup_cfg() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  STATUS="$TD/.claude/pokemon-status.sh"
  # Two earned badges so pins ownership checks have something to accept.
  echo '{"version":2,"lineage":"fire","current_level":5,"total_xp":2000000,"badges":[{"id":"hatch"},{"id":"first_evolution"}],"lifetime_stats":{}}' > "$PD/state.json"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }
seed_data() { jq '.language="fr" | .stats_share={enabled:false}' "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"; }
strip() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

# Run `pokemon-status.sh "$@"` via engine vs bash fallback from the same seed;
# assert identical stats_share AND stdout.
cfg_diff() {
  seed_data
  local e_out e_share
  e_out=$(bash "$STATUS" "$@" 2>/dev/null | strip)
  e_share=$(jq -S '.stats_share' "$PD/data.json")
  seed_data
  local b_out b_share
  b_out=$(POKEMON_ENGINE=/nope/e.mjs bash "$STATUS" "$@" 2>/dev/null | strip)
  b_share=$(jq -S '.stats_share' "$PD/data.json")
  [ "$e_share" = "$b_share" ] || { echo "SHARE DIFF ($*):"; diff <(echo "$b_share") <(echo "$e_share"); return 1; }
  [ "$e_out" = "$b_out" ] || { echo "STDOUT DIFF ($*):"; diff <(echo "$b_out") <(echo "$e_out"); return 1; }
}

@test "quote: show (unset)" { setup_cfg; cfg_diff quote; }
@test "quote: set multi-word" { setup_cfg; cfg_diff quote Salut le monde; }
@test "quote: too long rejected" { setup_cfg; local long; long=$(head -c 90 < /dev/zero | tr '\0' 'x'); cfg_diff quote "$long"; }
@test "quote: clear" { setup_cfg; cfg_diff quote clear; }
@test "bio: set multi-line" { setup_cfg; cfg_diff bio "Ligne une" "Ligne deux"; }
@test "bio: too many lines" { setup_cfg; cfg_diff bio a b c d e; }
@test "bio: clear" { setup_cfg; cfg_diff bio reset; }
@test "pins: show + owned list" { setup_cfg; cfg_diff pins; }
@test "pins: set valid (owned)" { setup_cfg; cfg_diff pins set hatch,first_evolution; }
@test "pins: set not-owned rejected" { setup_cfg; cfg_diff pins set champion; }
@test "pins: set too many" { setup_cfg; cfg_diff pins set hatch first_evolution hatch first_evolution; }
@test "pins: clear" { setup_cfg; cfg_diff pins clear; }
