#!/usr/bin/env bats
# TS engine render parity (Phase R3c).
#
# For every (scenario × ported view), runs the TS engine's `render` command and
# asserts its ANSI-stripped output is byte-identical to the frozen R3a fixture —
# the SAME fixtures the bash views are gated against (render-golden.bats). So a
# ported view is proven to reproduce the bash layout exactly. As views are
# ported, add them to PORTED_VIEWS below.
#
# Scenario states come from tests/render/scenarios.sh (shared with the bash
# capture) so the two backends can't drift in their inputs.

load '../helpers/setup.bash'

# Views ported to TS so far (grows each R3c slice).
PORTED_VIEWS=(badges inventory team pc stats pokedex main)

strip_ansi_file() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

@test "engine render is byte-identical to the frozen fixtures (ported views)" {
  local engine="$REPO_ROOT/lib/engine.mjs"
  local data locale tmp fails=0
  data=$(cat "$REPO_ROOT/lib/data.default.json")
  locale=$(cat "$REPO_ROOT/lib/locales/fr.json")
  tmp=$(mktemp -d)

  # shellcheck source=../render/scenarios.sh
  source "$REPO_ROOT/tests/render/scenarios.sh"

  for scenario in "${!RENDER_SCENARIOS[@]}"; do
    render_write_state "${RENDER_SCENARIOS[$scenario]}" "$tmp/state.json"
    local state
    state=$(cat "$tmp/state.json")
    for view in "${PORTED_VIEWS[@]}"; do
      local req fixture
      fixture="$REPO_ROOT/tests/render/fixtures/${scenario}__${view}.txt"
      req=$(jq -cn --argjson s "$state" --argjson d "$data" --argjson l "$locale" --arg v "$view" \
        '{view: $v, state: $s, data: $d, locale: $l, lang: "fr", scriptName: "pokemon-status.sh"}')
      printf '%s' "$req" | node "$engine" render "$view" 2>/dev/null | strip_ansi_file > "$tmp/got.txt"
      if ! diff -q "$fixture" "$tmp/got.txt" >/dev/null; then
        echo "MISMATCH ${scenario}__${view}:"
        diff "$fixture" "$tmp/got.txt" || true
        fails=$((fails + 1))
      fi
    done
  done
  rm -rf "$tmp"
  [ "$fails" -eq 0 ]
}

@test "engine render exits 3 for an unported view (bash fallback signal)" {
  run bash -c "printf '%s' '{\"view\":\"main\",\"state\":{},\"data\":{},\"locale\":{}}' | node '$REPO_ROOT/lib/engine.mjs' render recap"
  [ "$status" -eq 3 ]
}

# Differential test: for branches the 4 frozen fixtures DON'T cover (stats
# multipliers/tired/shiny-charm, pokedex seen lineages/shiny + seen multibyte
# wild names padded by awk), compare the engine directly against fresh bash.
# Pinned to a UTF-8 locale so awk's %-12s char-padding is deterministic.
@test "engine matches fresh bash on fixture-uncovered branches (stats, pokedex)" {
  export LC_ALL=C.UTF-8
  local tmp; tmp=$(mktemp -d)
  export HOME="$tmp"
  local pdir="$tmp/.claude/pokemon"
  mkdir -p "$pdir/locales"
  cp "$REPO_ROOT/lib/data.default.json" "$pdir/data.json"
  cp "$REPO_ROOT"/lib/locales/*.json "$pdir/locales/"
  cp "$REPO_ROOT/lib/lib.sh" "$pdir/lib.sh"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$tmp/.claude/pokemon-status.sh"
  jq '.language="fr" | .display_sprite_in_statusline="off"' "$pdir/data.json" > "$pdir/d.tmp"
  mv "$pdir/d.tmp" "$pdir/data.json"

  # Seen wild ids with multibyte names (accent / ♀ / ♂) → exercise awk char-pad.
  local ids seen wid
  ids=$(jq -c '[.wild_pool[] | select(.name_fr | test("[éèêàùçâîôûÉ♀♂]")) | .id][:5]' "$pdir/data.json")
  seen=$(jq -cn --argjson ids "$ids" 'reduce $ids[] as $i ({}; .[$i]={count:1})')
  wid=$(jq -r '.wild_pool[0].id' "$pdir/data.json") # a real wild id for events
  # Rich state: also exercises main's dense branches — held_item, injured,
  # evolution_history (incl. an entry missing .level/.evolved_at → "null"
  # quirk), recent_events (one of each type).
  jq -cn --argjson w "$seen" --arg wid "$wid" '{
    version:2, lineage:"fire", is_shiny:true, current_level:40, total_xp:60000000,
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
  }' > "$pdir/state.json"

  local data locale state
  data=$(cat "$pdir/data.json"); locale=$(cat "$pdir/locales/fr.json"); state=$(cat "$pdir/state.json")
  for view in stats pokedex main; do
    bash "$tmp/.claude/pokemon-status.sh" "$view" 2>/dev/null | strip_ansi_file > "$tmp/bash.txt"
    jq -cn --argjson s "$state" --argjson d "$data" --argjson l "$locale" --arg v "$view" \
      '{view:$v, state:$s, data:$d, locale:$l, lang:"fr", scriptName:"pokemon-status.sh"}' \
      | node "$REPO_ROOT/lib/engine.mjs" render "$view" | strip_ansi_file > "$tmp/engine.txt"
    if ! diff -q "$tmp/bash.txt" "$tmp/engine.txt" >/dev/null; then
      echo "DIFFERENTIAL MISMATCH ($view):"; diff "$tmp/bash.txt" "$tmp/engine.txt" || true
      rm -rf "$tmp"; false; return
    fi
  done
  rm -rf "$tmp"
}

@test "the positional <view> is authoritative over a stdin view" {
  # argv says badges, stdin says team → must render badges (exit 0, BADGES header).
  run bash -c "printf '%s' '{\"view\":\"team\",\"state\":{\"badges\":[]},\"data\":{},\"locale\":{}}' | node '$REPO_ROOT/lib/engine.mjs' render badges"
  [ "$status" -eq 0 ]
  [[ "$output" == *"badges.title"* ]]   # missing locale → key fallback (proves badges renderer ran)
}
