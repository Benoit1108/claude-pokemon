#!/usr/bin/env bats
# State-mutation bridge (Phase R3d-2). The deposit/withdraw/release subcommands
# now apply their collection transform via the TS engine (mutate), with a bash
# fallback. This asserts the engine path and the bash-fallback path produce an
# IDENTICAL resulting state.json AND identical stdout — so wiring the engine
# can't corrupt saves.

load '../helpers/setup.bash'

setup_dir() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/data.default.json" "$PD/data.json"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  jq '.language="fr"' "$PD/data.json" > "$PD/d.tmp" && mv "$PD/d.tmp" "$PD/data.json"
  STATUS="$TD/.claude/pokemon-status.sh"
}
mon() { jq -cn --arg l "$1" --argjson lv "$2" --arg n "$3" '{lineage:$l,is_shiny:false,level:$lv,total_xp:1000000,max_stage:$n,evolution_history:[],eevee_form:null,items:{},created_at:"2026-05-01T00:00:00Z",completed_at:"2026-05-05T00:00:00Z"}'; }
seed() { jq -cn --argjson team "$1" --argjson pc "$2" --arg lin "${3:-fire}" --argjson lvl "${4:-50}" '{version:2,lineage:$lin,is_shiny:false,current_level:$lvl,total_xp:5000000,evolution_history:[{level:1,name:"Salamèche"}],eevee_form:null,items:{},team:$team,pc_storage:$pc,pokedex:{},badges:[],friendship:0,created_at:"2026-05-01T00:00:00Z",lifetime_stats:{total_compagnons:0,lineages_completed:[],max_level:50,total_tokens:0,total_shinies:0}}' > "$PD/state.json"; }
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }

# Run a subcommand once via engine, once via bash fallback (POKEMON_ENGINE
# pointed at a bogus path), from the SAME seed; assert identical state + stdout.
assert_engine_eq_bash() {
  local seed_team="$1" seed_pc="$2"; shift 2  # remaining: the subcommand args
  seed "$seed_team" "$seed_pc"
  local out_engine state_engine
  out_engine=$(bash "$STATUS" "$@" 2>/dev/null | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g')
  state_engine=$(jq -S . "$PD/state.json")

  seed "$seed_team" "$seed_pc"
  local out_bash state_bash
  out_bash=$(POKEMON_ENGINE=/nope/engine.mjs bash "$STATUS" "$@" 2>/dev/null | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g')
  state_bash=$(jq -S . "$PD/state.json")

  [ "$state_engine" = "$state_bash" ] || { echo "STATE DIFF ($*):"; diff <(echo "$state_bash") <(echo "$state_engine"); return 1; }
  [ "$out_engine" = "$out_bash" ] || { echo "STDOUT DIFF ($*):"; diff <(echo "$out_bash") <(echo "$out_engine"); return 1; }
}

@test "deposit: engine path == bash fallback (state + stdout)" {
  setup_dir
  assert_engine_eq_bash "[$(mon fire 50 A),$(mon water 50 B)]" "[]" deposit 0
}

@test "withdraw to team: engine path == bash fallback" {
  setup_dir
  assert_engine_eq_bash "[$(mon fire 50 A)]" "[$(mon grass 8 Bulbizarre)]" withdraw 0
}

@test "withdraw to empty active: engine path == bash fallback" {
  setup_dir
  seed "[]" "[$(mon grass 8 Bulbizarre)]" null 0
  # custom: active is empty egg → withdraw loads into active
  assert_engine_eq_bash "[]" "[$(mon grass 8 Bulbizarre)]" withdraw 0
}

@test "withdraw team-full refusal: engine path == bash fallback" {
  setup_dir
  local six="[$(mon fire 50 A),$(mon water 50 B),$(mon grass 50 C),$(mon electric 50 D),$(mon eevee 50 E),$(mon totodile 50 F)]"
  assert_engine_eq_bash "$six" "[$(mon grass 8 Z)]" withdraw 0
}

@test "release team slot: engine path == bash fallback" {
  setup_dir
  assert_engine_eq_bash "[$(mon fire 50 A),$(mon water 50 B)]" "[]" release team 1 --confirm
}

@test "release pc slot: engine path == bash fallback" {
  setup_dir
  assert_engine_eq_bash "[]" "[$(mon grass 8 X),$(mon water 9 Y)]" release pc 0 --confirm
}

@test "switch: engine path == bash fallback" {
  setup_dir
  assert_engine_eq_bash "[$(mon water 30 Carabaffe),$(mon grass 20 X)]" "[]" switch 0
}

@test "hatch (with active companion): engine path == bash fallback" {
  setup_dir
  assert_engine_eq_bash "[$(mon water 30 B)]" "[]" hatch water
}

@test "ceremonial reset (with active): engine path == bash fallback" {
  setup_dir
  assert_engine_eq_bash "[]" "[]" reset
}

@test "hatch from an egg (no active companion): engine path == bash fallback" {
  setup_dir
  local s_e st_e o_e st_b o_b
  seed "[]" "[]" null 0
  o_e=$(bash "$STATUS" hatch fire 2>/dev/null | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'); st_e=$(jq -S . "$PD/state.json")
  seed "[]" "[]" null 0
  o_b=$(POKEMON_ENGINE=/nope/engine.mjs bash "$STATUS" hatch fire 2>/dev/null | sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'); st_b=$(jq -S . "$PD/state.json")
  [ "$st_e" = "$st_b" ] || { echo "STATE DIFF:"; diff <(echo "$st_b") <(echo "$st_e"); return 1; }
  [ "$o_e" = "$o_b" ] || { echo "OUT DIFF:"; diff <(echo "$o_b") <(echo "$o_e"); return 1; }
}
