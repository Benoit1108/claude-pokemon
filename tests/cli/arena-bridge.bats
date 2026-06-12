#!/usr/bin/env bats
# Arena bridge (Phase R3d-4b). status/enable/disable/regenerate/opponents/
# challenge/battle run via the engine `arena` command (Node fetch + battle
# replay); bash owns the arena_secret file via the engine's `secret` op. A
# path-routing mock worker backs the network subs. Deterministic/render subs
# are diffed byte-exact vs bash; secret-file effects checked structurally.
# live/pair/link → exit 3 → bash fallback (ported separately).

load '../helpers/setup.bash'

BATTLE='{"battle":{"battle_id":"b123","challenger":{"anon_id":"abcd1234","display_name":"Moi","lineage":"fire","level":40,"is_shiny":false},"defender":{"anon_id":"zzz","display_name":"Rival","lineage":"water","level":38,"is_shiny":true},"winner":"challenger","reason":"ko","turns":[{"turn":1,"actor":"challenger","damage":30,"effectiveness":2.0,"critical":false},{"turn":2,"actor":"defender","damage":12,"effectiveness":0.5,"critical":true}]}}'

setup_arena() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  STATUS="$TD/.claude/pokemon-status.sh"
  echo '{"version":2,"lineage":"fire","current_level":40,"is_shiny":false,"badges":[],"lifetime_stats":{}}' > "$PD/state.json"
  # Path-routing mock worker.
  node -e '
    const h=require("http"); const battle=process.argv[1];
    const s=h.createServer((q,r)=>{
      let b="{}";
      if(q.url.includes("/arena/pair/init")) b="{\"code\":\"ABCD23\",\"expires_at\":\"2026-06-12T13:00:00Z\"}";
      else if(q.url.includes("/arena/pair/redeem")) b="{\"anon_id\":\"newanon1\",\"arena_secret\":\"sek2\"}";
      else if(q.url.includes("/trainer/")) b="{\"stats\":{\"active\":{\"lineage\":\"water\",\"current_level\":22,\"is_shiny\":true},\"lifetime\":{\"total_tokens\":500,\"max_level\":22},\"badges\":[\"hatch\"],\"pokedex_seen_ids\":[\"pikachu\"]}}";
      else if(q.url.includes("/arena/enable")||q.url.includes("/arena/regenerate")) b="{\"arena_secret\":\"newsecret123\"}";
      else if(q.url.includes("/arena/opponents")) b="{\"total\":2,\"opponents\":[{\"anon_id\":\"o1\",\"display_name\":\"Riv\",\"lineage\":\"water\",\"level\":30,\"is_shiny\":true},{\"anon_id\":\"o2\",\"display_name\":\"\",\"lineage\":\"grass\",\"level\":12,\"is_shiny\":false}]}";
      else if(q.url.includes("/arena/challenge")||q.url.includes("/arena/battle/")) b=battle;
      else b="{\"ok\":true}";
      r.writeHead(200,{"content-type":"application/json"}); r.end(b);
    });
    s.listen(0,()=>require("fs").writeFileSync(process.argv[2], String(s.address().port)));
  ' "$BATTLE" "$TD/port" &
  SRV=$!
  local tries=0; while [ ! -s "$TD/port" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries+1)); done
  ENDPOINT="http://localhost:$(cat "$TD/port")"
}
teardown() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; [ -n "${TD:-}" ] && rm -rf "$TD"; }
strip() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }
seed_arena() { jq --arg ep "$ENDPOINT" --argjson en "$1" \
  '.language="fr" | .stats_share={enabled:true,anon_id:"abcd1234",endpoint:$ep} | .arena={enabled:$en,web_url:"https://w"}' \
  "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"; }

# engine vs bash for a (mostly) deterministic-render sub; assert identical stdout.
arena_diff() {
  local en="$1"; shift
  seed_arena "$en"; [ -n "${ASECRET:-}" ] && printf '%s' "$ASECRET" > "$PD/.arena-secret"
  local e; e=$(bash "$STATUS" arena "$@" 2>/dev/null | strip)
  seed_arena "$en"; [ -n "${ASECRET:-}" ] && printf '%s' "$ASECRET" > "$PD/.arena-secret"
  local b; b=$(POKEMON_ENGINE=/nope/e.mjs bash "$STATUS" arena "$@" 2>/dev/null | strip)
  [ "$e" = "$b" ] || { echo "ARENA DIFF ($*):"; diff <(echo "$b") <(echo "$e"); return 1; }
}

@test "arena status (enabled)" { setup_arena; arena_diff true status; }
@test "arena status (disabled)" { setup_arena; arena_diff false status; }
@test "arena opponents list" { setup_arena; arena_diff true opponents 10; }
@test "arena challenge (battle replay)" { setup_arena; ASECRET=sek arena_diff true challenge zzz; }
@test "arena battle by id (replay)" { setup_arena; arena_diff true battle b123; }
@test "arena challenge usage (no target)" { setup_arena; arena_diff true challenge; }
@test "arena unknown subcommand falls back to bash" { setup_arena; arena_diff true wat; }

@test "arena enable --confirm saves the secret file + flips data (structure)" {
  setup_arena
  seed_arena false
  run bash "$STATUS" arena enable --confirm
  [ "$status" -eq 0 ]
  [ "$(jq -r '.arena.enabled' "$PD/data.json")" = "true" ]
  [ "$(cat "$PD/.arena-secret")" = "newsecret123" ]
}

@test "arena disable clears the secret file + flips data" {
  setup_arena
  seed_arena true
  printf 'oldsec' > "$PD/.arena-secret"
  run bash "$STATUS" arena disable
  [ "$status" -eq 0 ]
  [ "$(jq -r '.arena.enabled' "$PD/data.json")" = "false" ]
  [ ! -f "$PD/.arena-secret" ]
}

@test "arena pair (code + url, qrencode-absent hint)" {
  setup_arena
  ASECRET=sek arena_diff true pair
}

@test "arena link redeems + syncs state (engine vs bash output)" {
  setup_arena
  # link rewrites state with now-stamped fields; compare output only.
  arena_diff false link abcd23
}

@test "arena link writes the secret + flips data + syncs state (structure)" {
  setup_arena
  seed_arena false
  run bash "$STATUS" arena link abcd23
  [ "$status" -eq 0 ]
  [ "$(cat "$PD/.arena-secret")" = "sek2" ]
  [ "$(jq -r '.stats_share.anon_id' "$PD/data.json")" = "newanon1" ]
  [ "$(jq -r '.arena.enabled' "$PD/data.json")" = "true" ]
  [ "$(jq -r '.current_level' "$PD/state.json")" = "22" ]
  [ "$(jq -r '.lineage' "$PD/state.json")" = "water" ]
}
