#!/usr/bin/env bats
# Golden snapshots of the Node entrypoints (Phase R3d-6). After bash is removed
# the TS engine IS the implementation, so regression coverage shifts from
# "engine == bash" to "engine output == frozen golden". This captures the
# ANSI-stripped output of the real Node entrypoints (pokemon.mjs / statusline.mjs)
# for a rich, fixed scenario into committed files under tests/golden-node/, and
# diffs on every run. Regenerate after an intentional change:
#   CAPTURE=1 bats tests/cli/golden-node.bats
# then review + commit tests/golden-node/*.txt.
#
# Complements: render-engine-parity.bats (4 base scenarios × views vs the frozen
# R3a fixtures) + the shared vitest (engine logic). This file covers the rich/
# edge branches + the statusline + the dispatch end-to-end, sans bash.

load '../helpers/setup.bash'

GOLDEN_DIR="$REPO_ROOT/tests/golden-node"
FIXED="2026-05-08T12:05:00Z"

setup_golden() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/statusline.mjs" "$REPO_ROOT/lib/pokemon.mjs" "$PD/"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp -r "$REPO_ROOT/lib/sprites-mini" "$PD/sprites-mini"
  EP=$(date -u -d "$FIXED" +%s)
  jq '.language="fr" | .display_sprite_in_statusline="off"
      | .stats_share={enabled:true,anon_id:"abcd1234ef",display_name:"Sacha",endpoint:"x"}' \
    "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
  mkdir -p "$GOLDEN_DIR"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }
strip() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

# gold <name> -- <argv...> : run `node pokemon.mjs <argv>` and capture/diff.
gold_pokemon() {
  local name="$1"; shift
  local got; got=$(POKEMON_NOW_EPOCH="$EP" POKEMON_DIR="$PD" node "$PD/pokemon.mjs" "$@" 2>/dev/null | strip)
  local f="$GOLDEN_DIR/$name.txt"
  if [ "${CAPTURE:-}" = "1" ]; then printf '%s\n' "$got" > "$f"; return 0; fi
  [ -f "$f" ] || { echo "missing golden $f (run CAPTURE=1)"; return 1; }
  diff <(cat "$f") <(printf '%s\n' "$got") || { echo "GOLDEN DIFF ($name)"; return 1; }
}
# statusline golden (stdin = Claude input).
gold_statusline() {
  local name="$1" input="$2"
  local got; got=$(printf '%s' "$input" | POKEMON_NOW_EPOCH="$EP" POKEMON_DIR="$PD" node "$PD/statusline.mjs" 2>/dev/null | strip)
  local f="$GOLDEN_DIR/$name.txt"
  if [ "${CAPTURE:-}" = "1" ]; then printf '%s\n' "$got" > "$f"; return 0; fi
  [ -f "$f" ] || { echo "missing golden $f (run CAPTURE=1)"; return 1; }
  diff <(cat "$f") <(printf '%s\n' "$got") || { echo "GOLDEN DIFF ($name)"; return 1; }
}

# Rich state — dense branches: shiny, held item, injured, every recent_event
# type, multibyte pokédex names, lifetime stats, badges.
seed_rich() {
  local ids seen wid
  ids=$(jq -c '[.wild_pool[] | select(.name_fr | test("[éèêàùçâîôûÉ♀♂]")) | .id][:5]' "$PD/data.json")
  seen=$(jq -cn --argjson ids "$ids" 'reduce $ids[] as $i ({}; .[$i]={count:1})')
  wid=$(jq -r '.wild_pool[0].id' "$PD/data.json")
  jq -cn --argjson w "$seen" --arg wid "$wid" '{
    version:2, lineage:"fire", is_shiny:true, current_level:40, total_xp:60000000,
    xp_rebalance_v2_acknowledged:true,
    evolution_history:[{level:1,name:"Salamèche",evolved_at:"2026-05-08T10:00:00Z",is_shiny:true},{name:"Reptincel"}],
    sessions:{}, badges:[{id:"first_shiny",earned_at:"2026-05-08T00:00:00Z"}], team:[], pc_storage:[],
    pokedex:{fire:{seen:true,shiny_seen:true,count:3,shiny_count:1},water:{seen:true,shiny_seen:false,count:2,shiny_count:0}},
    pokedex_wild:$w, items:{oran_berry:2}, held_item:"oran_berry", injured_ticks_remaining:3,
    friendship:550, status:"tired", high_context_streak:7,
    recent_events:[
      {type:"berry",name:"Baie Oran",emoji:"🍒",xp:500,at:"2026-05-08T09:00:00Z"},
      {type:"encounter",id:$wid,at:"2026-05-08T09:01:00Z"},
      {type:"battle_won",id:$wid,xp:1200,at:"2026-05-08T09:02:00Z"},
      {type:"battle_lost",id:$wid,at:"2026-05-08T09:03:00Z"},
      {type:"item",name:"Pierre Feu",emoji:"🔥",at:"2026-05-08T09:04:00Z"},
      {type:"trade",name:"Pikachu",at:"2026-05-08T09:05:00Z"}
    ],
    last_xp_multipliers:{context:"2.0",type_match:"1.2",daily_bonus:"1.5",status:"0.75"},
    lifetime_stats:{total_tokens:123456789,total_evolutions:3,total_shinies:4,max_level:40,lineages_completed:["fire","water"],total_compagnons:2,first_shiny_at:"2026-05-08T12:00:00Z"}
  }' > "$PD/state.json"
}

# Session state for recap (baseline + events under the pinned clock).
seed_session() {
  local wid; wid=$(jq -r '.wild_pool[0].id' "$PD/data.json")
  jq -cn --arg wid "$wid" '{
    version:2, lineage:"fire", current_level:5, total_xp:2000000, friendship:50,
    xp_rebalance_v2_acknowledged:true,
    sessions:{s1:{first_seen:"2026-05-08T10:00:00Z", last_seen:"2026-05-08T12:05:00Z",
      baseline:{total_xp:1000000, friendship:10, lifetime_tokens:1000, current_level:3}}},
    recent_events:[
      {type:"berry",name:"Baie",emoji:"🍒",xp:500,at:"2026-05-08T11:00:00Z"},
      {type:"encounter",id:$wid,at:"2026-05-08T11:10:00Z"},
      {type:"battle_won",id:$wid,xp:900,wild_level:12,at:"2026-05-08T11:20:00Z"},
      {type:"battle_lost",id:$wid,wild_level:40,at:"2026-05-08T11:30:00Z"},
      {type:"item",name:"Pierre Feu",emoji:"🔥",at:"2026-05-08T11:40:00Z"}
    ],
    evolution_history:[{level:16,name:"Reptincel",evolved_at:"2026-05-08T11:45:00Z"}],
    badges:[{id:"first_evolution",earned_at:"2026-05-08T11:46:00Z"}],
    lifetime_stats:{total_tokens:5000,total_shinies:0,max_level:5,lineages_completed:[]}
  }' > "$PD/state.json"
}

@test "golden: rich-state views (stats / pokedex / main / trainer-card / badges)" {
  setup_golden; seed_rich
  gold_pokemon stats_rich stats
  gold_pokemon pokedex_rich pokedex
  gold_pokemon main_rich
  gold_pokemon trainer_card_rich trainer-card
  gold_pokemon badges_rich badges
}

@test "golden: recap session + today" {
  setup_golden; seed_session
  gold_pokemon recap_session recap session
  gold_pokemon recap_today recap today
}

# Behavioral (not a snapshot): the one-time XP-rebalance notice fires once via
# the Node main view, sets the flag, and never re-fires (port of the bash
# xp_rebalance_notice.bats — now Node-only).
@test "xp-rebalance notice fires once then acks (Node main view)" {
  setup_golden
  echo '{"version":2,"lineage":"fire","current_level":40,"total_xp":60000000,"is_shiny":false,"evolution_history":[{"level":1,"name":"Salamèche"}],"lifetime_stats":{}}' > "$PD/state.json"
  out1=$(POKEMON_DIR="$PD" node "$PD/pokemon.mjs" 2>/dev/null | strip)
  [[ "$out1" == *"rééquilibr"* || "$out1" == *"XP"* ]]
  [ "$(jq -r '.xp_rebalance_v2_acknowledged' "$PD/state.json")" = "true" ]
  out2=$(POKEMON_DIR="$PD" node "$PD/pokemon.mjs" 2>/dev/null | strip)
  [[ "$out2" != *"rééquilibr"* ]]
}

# Below 1000 total_xp the notice never fires (fresh eggs skip it).
@test "xp-rebalance notice skipped for a fresh low-XP state" {
  setup_golden
  echo '{"version":2,"lineage":"fire","current_level":0,"total_xp":0,"evolution_history":[],"lifetime_stats":{}}' > "$PD/state.json"
  out=$(POKEMON_DIR="$PD" node "$PD/pokemon.mjs" 2>/dev/null | strip)
  [[ "$out" != *"rééquilibr"* ]]
  [ "$(jq -r '.xp_rebalance_v2_acknowledged // "absent"' "$PD/state.json")" = "absent" ]
}

@test "golden: statusline layouts + gauge tiers" {
  setup_golden; seed_rich
  gold_statusline sl_30 '{"model":{"display_name":"Sonnet"},"context_window":{"used_percentage":30},"effort":{"level":"medium"},"session_id":"s1"}'
  gold_statusline sl_90 '{"model":{"display_name":"Opus 4.8 (1M context)"},"context_window":{"used_percentage":90},"effort":{"level":"max"},"session_id":"s1"}'
  jq '.display_sprite_in_statusline="left"' "$PD/data.json" > "$PD/d.tmp" && mv "$PD/d.tmp" "$PD/data.json"
  seed_rich
  gold_statusline sl_sprite_left '{"model":{"display_name":"Sonnet"},"context_window":{"used_percentage":45},"session_id":"s1"}'
}
