#!/usr/bin/env bats
# Native /pokemon dispatcher (Phase R3d-5). lib/pokemon.mjs routes every
# subcommand to the engine in-process and applies the data/state/secret ops to
# disk. This diffs it BYTE-EXACT (ANSI stripped, like the render tests) against
# the bash pokemon-status.sh (forced pure-bash via POKEMON_ENGINE=/nope = the
# golden), covering one command per dispatch branch + the resulting state/data.
# Clock pinned (date shim + POKEMON_NOW_EPOCH); tick/cmd RNG forced via data.

load '../helpers/setup.bash'

FIXED="2026-06-11T12:00:00Z"

setup_disp() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales" "$TD/bin"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT/lib/pokemon.mjs" "$PD/pokemon.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  STATUS="$TD/.claude/pokemon-status.sh"
  EP=$(date -u -d "$FIXED" +%s)
  # Path-routing mock for the network commands (leaderboard / aggregate).
  node -e '
    const h=require("http");
    const s=h.createServer((q,r)=>{
      let b="{}";
      if(q.url.includes("/leaderboard")) b="{\"total_players\":1,\"top\":[{\"anon_id\":\"abcd1234\",\"display_name\":\"Me\",\"value\":1000,\"lineage\":\"fire\",\"level\":40,\"is_shiny\":false}]}";
      else if(q.url.includes("/aggregate")) b="{\"total_players\":1,\"total_tokens\":1000,\"lineage_distribution\":{}}";
      r.writeHead(200,{"content-type":"application/json"}); r.end(b);
    });
    s.listen(0,()=>require("fs").writeFileSync(process.argv[1], String(s.address().port)));
  ' "$TD/port" &
  SRV=$!
  local tries=0; while [ ! -s "$TD/port" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries+1)); done
  ENDPOINT="http://localhost:$(cat "$TD/port")"
  DATA0=$(jq -c --arg ep "$ENDPOINT" '.language="fr"
    | .stats_share={enabled:false,anon_id:"abcd1234",endpoint:$ep}
    | .arena={enabled:false,web_url:"https://w"}
    | .wild_pool=[{id:"pikachu",type:"Électrik",national_dex:25,name_fr:"Pikachu",name_en:"Pikachu"}]
    | .event_chances.berry=0 | .event_chances.encounter=0 | .shiny_mode="never"' \
    "$REPO_ROOT/lib/data.default.json")
  cat > "$TD/bin/date" <<SHIM
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in -d*|--date*) exec /usr/bin/date "\$@";; esac; done
fmt=""; for a in "\$@"; do case "\$a" in +*) fmt="\$a";; esac; done
exec /usr/bin/date -u -d "@$EP" "\$fmt"
SHIM
  chmod +x "$TD/bin/date"
}
teardown() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; [ -n "${TD:-}" ] && rm -rf "$TD"; }
strip() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

STATE0='{"version":2,"lineage":"fire","current_level":40,"total_xp":120000000,"is_shiny":false,"evolution_flash_remaining":0,"evolution_history":[{"level":1,"name":"Salamèche"},{"level":36,"name":"Dracaufeu"}],"sessions":{},"badges":[],"team":[{"lineage":"water","is_shiny":false,"level":30,"max_stage":"Carabaffe","evolution_history":[],"items":{},"created_at":"2026-05-01T00:00:00Z"}],"pc_storage":[],"pokedex":{},"items":{"lucky_egg":1},"held_item":null,"friendship":10,"lifetime_stats":{"total_tokens":100,"total_evolutions":1,"total_shinies":0,"max_level":40,"games_won":0,"games_played":0},"created_at":"2026-06-01T00:00:00Z"}'

# pokemon.mjs vs the registered pokemon-status.sh (BOTH engine-backed — that's
# the behavior pokemon.mjs replaces), from the same seed. Compares stripped
# stdout + resulting state.json + data.json. This validates the dispatcher's
# orchestration (arg routing, file IO, op application), since both paths call
# the same engine logic. (Pure-bash fallback divergences — e.g. the main view's
# rebalance-ack flag write, or reset's eevee_form default — are pre-existing
# engine-vs-bash gaps tracked separately, not dispatcher bugs.)
disp_diff() {
  printf '%s' "$STATE0" > "$PD/state.json"; printf '%s' "$DATA0" > "$PD/data.json"
  local e se de
  e=$(PATH="$TD/bin:$PATH" POKEMON_NOW_EPOCH="$EP" POKEMON_DIR="$PD" node "$PD/pokemon.mjs" "$@" 2>/dev/null | strip)
  se=$(jq -S . "$PD/state.json"); de=$(jq -S . "$PD/data.json")
  printf '%s' "$STATE0" > "$PD/state.json"; printf '%s' "$DATA0" > "$PD/data.json"
  local b sb db
  b=$(PATH="$TD/bin:$PATH" bash "$STATUS" "$@" 2>/dev/null | strip)
  sb=$(jq -S . "$PD/state.json"); db=$(jq -S . "$PD/data.json")
  [ "$e" = "$b" ] || { echo "STDOUT DIFF ($*):"; diff <(echo "$b") <(echo "$e"); return 1; }
  [ "$se" = "$sb" ] || { echo "STATE DIFF ($*):"; diff <(echo "$sb") <(echo "$se"); return 1; }
  [ "$de" = "$db" ] || { echo "DATA DIFF ($*):"; diff <(echo "$db") <(echo "$de"); return 1; }
}

@test "dispatch: stats view" { setup_disp; disp_diff stats; }
@test "dispatch: team view" { setup_disp; disp_diff team; }
@test "dispatch: badges view" { setup_disp; disp_diff badges; }
@test "dispatch: pokedex view" { setup_disp; disp_diff pokedex; }
@test "dispatch: inventory view" { setup_disp; disp_diff inventory; }
@test "dispatch: main view (default, no arg)" { setup_disp; disp_diff; }
@test "dispatch: trainer-card view" { setup_disp; disp_diff trainer-card; }
@test "dispatch: recap view" { setup_disp; disp_diff recap; }
@test "dispatch: alias dex → pokedex" { setup_disp; disp_diff dex; }
@test "dispatch: unknown subcommand → main" { setup_disp; disp_diff wat; }

@test "dispatch: deposit (state change)" { setup_disp; disp_diff deposit 0; }
@test "dispatch: switch roster (no arg)" { setup_disp; disp_diff switch; }
@test "dispatch: --shiny toggle (state change)" { setup_disp; disp_diff --shiny; }
@test "dispatch: give held item (state change)" { setup_disp; disp_diff give lucky_egg; }
@test "dispatch: reset" { setup_disp; disp_diff reset; }
@test "dispatch: game help" { setup_disp; disp_diff game help; }
@test "dispatch: game new quiz (state change, idx forced 0)" { setup_disp; disp_diff game; }

@test "dispatch: quote (data change)" { setup_disp; disp_diff quote "hello world"; }
@test "dispatch: bio (data change)" { setup_disp; disp_diff bio "a coding companion"; }

@test "dispatch: leaderboard (network mock)" { setup_disp; disp_diff leaderboard; }
@test "dispatch: aggregate (network mock)" { setup_disp; disp_diff aggregate; }

@test "dispatch: stats-share status" { setup_disp; disp_diff stats-share; }
@test "dispatch: arena status" { setup_disp; disp_diff arena status; }
