#!/usr/bin/env bats
# Statusline tick bridge (Phase R3d-3). The engine `tick` owns the tick logic
# but takes all randomness as injected `decisions`, so it's deterministic and
# diffable against the bash tick. A `date` shim fixes the clock; randomness is
# controlled via data (event_chances 0/1, single-entry pools, shiny_mode). The
# battle + Eevee-evolution branches (wild_level/bonus_xp come from $RANDOM →
# impractical to bash-pin) are covered by shared/tests/tick.test.ts instead.

load '../helpers/setup.bash'

FIXED="2026-06-11T12:00:00Z"

setup_tick_env() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD" "$TD/bin"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  EP=$(date -u -d "$FIXED" +%s)
  cat > "$TD/bin/date" <<SHIM
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in -d*|--date*) exec /usr/bin/date "\$@";; esac; done
fmt=""; for a in "\$@"; do case "\$a" in +*) fmt="\$a";; esac; done
exec /usr/bin/date -u -d "@$EP" "\$fmt"
SHIM
  chmod +x "$TD/bin/date"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }

# tick_diff <data-jq-filter> <state-json> <decisions-json> <used_pct>
tick_diff() {
  jq "$1" "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
  printf '%s' "$2" > "$PD/state.json"
  PATH="$TD/bin:$PATH" bash -c "source '$PD/lib.sh'; pokemon_tick s1 50000 $4" >/dev/null 2>&1
  jq -S 'del(.last_updated)' "$PD/state.json" > "$TD/bash.json"

  printf '%s' "$2" > "$PD/state.json"
  jq -cn --slurpfile st "$PD/state.json" --slurpfile dt "$PD/data.json" \
        --argjson dec "$3" --arg now "$FIXED" --argjson ep "$EP" --argjson pct "$4" \
    '{state:$st[0], data:$dt[0], now:$now, now_epoch:$ep, session_id:"s1",
      current_tokens:50000, used_pct:$pct, decisions:$dec}' \
    | node "$PD/engine.mjs" tick | jq -S 'del(.state.last_updated) | .state' > "$TD/engine.json"

  if ! diff -q "$TD/bash.json" "$TD/engine.json" >/dev/null; then
    echo "TICK DIFF:"; diff "$TD/bash.json" "$TD/engine.json"; return 1
  fi
}

DEC_OFF='{"starter":null,"shiny":false,"eevee_fallback_index":0,"berry":{"fired":false,"index":0},"encounter":{"fired":false,"index":0},"battle":{"fired":false,"wild_level":0,"bonus_xp_raw":0},"item":{"fired":false,"index":0}}'

base_state() { # $1 lineage, $2 level, $3 total_xp
  jq -cn --arg lin "$1" --argjson lv "$2" --argjson xp "$3" '{version:2,lineage:$lin,is_shiny:false,
    current_level:$lv,total_xp:$xp,evolution_history:(if $lv>=1 then [{level:1,name:"Salamèche"}] else [] end),
    evolution_flash_remaining:0,eevee_form:null,
    sessions:{s1:{last_seen:"2026-06-11T11:00:00Z",first_seen:"2026-06-11T10:00:00Z",last_tick_tokens:0}},
    badges:[],team:[],pc_storage:[],pokedex:{fire:{seen:true,count:1,shiny_seen:false,shiny_count:0,first_seen_at:"2026-06-01T00:00:00Z"}},
    pokedex_wild:{},items:{},friendship:10,status:"ok",high_context_streak:0,injured_ticks_remaining:0,
    last_daily_bonus_date:"2026-06-11",lifetime_stats:{total_tokens:100,total_evolutions:1,total_shinies:0,
    max_level:$lv,lineages_completed:[],total_compagnons:0,first_shiny_at:null},
    xp_rebalance_v2_acknowledged:true,created_at:"2026-06-01T00:00:00Z"}'
}

@test "tick (no events, steady): engine == bash" {
  setup_tick_env
  tick_diff '.event_chances.berry=0|.event_chances.encounter=0|.shiny_mode="never"' "$(base_state fire 5 2000000)" "$DEC_OFF" 20
}

@test "tick level-up + evolution transition: engine == bash" {
  setup_tick_env
  local thr16; thr16=$(jq '.thresholds[16]' "$REPO_ROOT/lib/data.default.json")
  local st; st=$(base_state fire 15 $((thr16 - 5000)))
  tick_diff '.event_chances.berry=0|.event_chances.encounter=0|.shiny_mode="never"' "$st" "$DEC_OFF" 20
}

@test "tick hatch 0→1 + shiny: engine == bash" {
  setup_tick_env
  local thr1; thr1=$(jq '.thresholds[1]' "$REPO_ROOT/lib/data.default.json")
  local st; st=$(base_state fire 0 $((thr1 - 5000)))
  tick_diff '.event_chances.berry=0|.event_chances.encounter=0|.shiny_mode="always"' "$st" "$(echo "$DEC_OFF" | jq '.shiny=true')" 20
}

@test "tick events (berry + encounter + item, battle off): engine == bash" {
  setup_tick_env
  local dec; dec=$(echo "$DEC_OFF" | jq '.berry.fired=true|.encounter.fired=true|.item.fired=true')
  tick_diff '.event_chances.berry=1|.event_chances.encounter=1|.battle_chance_on_encounter=0|.item_drop_chance_on_encounter=1|.shiny_mode="never"|.berries=[.berries[0]]|.wild_pool=[.wild_pool[0]]|.items=({(.items|keys[0]):(.items[(.items|keys[0])])})' "$(base_state fire 5 2000000)" "$dec" 20
}

# Live wiring (R3d-3b): the real pokemon_tick via the engine fast-path vs the
# bash fallback (POKEMON_ENGINE bogus), same seed + fixed clock + rolls off →
# identical state. Proves the bash decision-computation + engine + fallback are
# consistent end-to-end.
@test "live: pokemon_tick engine fast-path == bash fallback" {
  setup_tick_env
  jq '.event_chances.berry=0|.event_chances.encounter=0|.shiny_mode="never"' \
    "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
  local st; st=$(base_state fire 5 2000000)

  printf '%s' "$st" > "$PD/state.json"
  PATH="$TD/bin:$PATH" bash -c "source '$PD/lib.sh'; pokemon_tick s1 50000 20" >/dev/null 2>&1
  jq -S 'del(.last_updated)' "$PD/state.json" > "$TD/engine.json"

  printf '%s' "$st" > "$PD/state.json"
  PATH="$TD/bin:$PATH" POKEMON_ENGINE=/nope/e.mjs bash -c "source '$PD/lib.sh'; pokemon_tick s1 50000 20" >/dev/null 2>&1
  jq -S 'del(.last_updated)' "$PD/state.json" > "$TD/bash.json"

  run diff "$TD/bash.json" "$TD/engine.json"
  [ "$status" -eq 0 ] || { echo "$output"; false; }
}

@test "live: fractional used_pct (.5 boundary) consistent engine vs fallback" {
  setup_tick_env
  jq '.event_chances.berry=0|.event_chances.encounter=0|.shiny_mode="never"' \
    "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
  local st; st=$(base_state fire 5 2000000)
  # 25.5 sits on the xp-multiplier bucket edge (≤25 → 2.0, else 1.5). Both paths
  # round via printf '%.0f' → must agree.
  printf '%s' "$st" > "$PD/state.json"
  PATH="$TD/bin:$PATH" bash -c "source '$PD/lib.sh'; pokemon_tick s1 50000 25.5" >/dev/null 2>&1
  jq -S 'del(.last_updated)' "$PD/state.json" > "$TD/engine.json"
  printf '%s' "$st" > "$PD/state.json"
  PATH="$TD/bin:$PATH" POKEMON_ENGINE=/nope/e.mjs bash -c "source '$PD/lib.sh'; pokemon_tick s1 50000 25.5" >/dev/null 2>&1
  jq -S 'del(.last_updated)' "$PD/state.json" > "$TD/bash.json"
  run diff "$TD/bash.json" "$TD/engine.json"
  [ "$status" -eq 0 ] || { echo "$output"; false; }
}
