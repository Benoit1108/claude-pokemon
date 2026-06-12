#!/usr/bin/env bats
# Live PvP bridge (Phase R3d-4b). `arena live <sub>` runs through the engine
# `arena` command (Node fetch + HP/state render + the per-stage move-hint
# table); bash owns the arena_secret file. A path-routing mock worker backs
# invite/accept/status/commit/forfeit. Each sub is diffed byte-exact vs the
# bash fallback (POKEMON_ENGINE=/nope), with the clock unused (live carries no
# timestamps). last_live_battle_id persistence is checked structurally.

load '../helpers/setup.bash'

# An active battle snapshot — challenger is the local trainer (fire Lv.40 →
# charizard moveset), defender is a water rival; neither has committed yet, so
# the local move list renders.
STATUS='{"state":"active","turn_no":1,"winner":null,"reason":null,"challenger":{"anon_id":"abcd1234","snapshot":{"lineage":"fire","level":40},"hp":100,"has_pending_action":false},"defender":{"anon_id":"zzz","snapshot":{"lineage":"water","level":38},"hp":90,"has_pending_action":false}}'
# Defender not yet accepted → hp:null → "en attente d'acceptation" line.
STATUS_WAIT='{"state":"active","turn_no":0,"winner":null,"reason":null,"challenger":{"anon_id":"abcd1234","snapshot":{"lineage":"fire","level":40},"hp":100,"has_pending_action":false},"defender":{"anon_id":"zzz","snapshot":{"lineage":"water","level":38},"hp":null,"has_pending_action":false}}'
# Finished battle → 🏁 line + early return (no move list).
STATUS_FIN='{"state":"finished","turn_no":7,"winner":"challenger","reason":"ko","challenger":{"anon_id":"abcd1234","snapshot":{"lineage":"fire","level":40},"hp":80,"has_pending_action":true},"defender":{"anon_id":"zzz","snapshot":{"lineage":"water","level":38},"hp":0,"has_pending_action":true}}'
# Local trainer is the DEFENDER (me==dId) → defender move list (water Lv.38 → blastoise).
STATUS_DEF='{"state":"active","turn_no":2,"winner":null,"reason":null,"challenger":{"anon_id":"zzz","snapshot":{"lineage":"fire","level":40},"hp":90,"has_pending_action":true},"defender":{"anon_id":"abcd1234","snapshot":{"lineage":"water","level":38},"hp":70,"has_pending_action":false}}'

setup_live() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  STATUS_SH="$TD/.claude/pokemon-status.sh"
  echo '{"version":2,"lineage":"fire","current_level":40,"is_shiny":false,"badges":[],"lifetime_stats":{}}' > "$PD/state.json"
  node -e '
    const h=require("http");
    const [status,_port,wait,fin,def]=process.argv.slice(1);
    const s=h.createServer((q,r)=>{
      let b="{}";
      if(q.url.includes("/live/invite")) b="{\"battle_id\":\"lb1\"}";
      else if(q.url.includes("/accept")) b="{\"state\":\"active\"}";
      else if(q.url.includes("/forfeit")) b="{\"state\":\"abandoned\"}";
      else if(q.url.includes("/commit")) b=status;
      else if(q.url.includes("/arena/live/")) {
        if(q.url.includes("lbwait")) b=wait;
        else if(q.url.includes("lbfin")) b=fin;
        else if(q.url.includes("lbdef")) b=def;
        else b=status;
      }
      r.writeHead(200,{"content-type":"application/json"}); r.end(b);
    });
    s.listen(0,()=>require("fs").writeFileSync(process.argv[2], String(s.address().port)));
  ' "$STATUS" "$TD/port" "$STATUS_WAIT" "$STATUS_FIN" "$STATUS_DEF" &
  SRV=$!
  local tries=0; while [ ! -s "$TD/port" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries+1)); done
  ENDPOINT="http://localhost:$(cat "$TD/port")"
}
teardown() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; [ -n "${TD:-}" ] && rm -rf "$TD"; }
strip() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }
seed_live() { jq --arg ep "$ENDPOINT" --argjson en "$1" \
  '.language="fr" | .stats_share={enabled:true,anon_id:"abcd1234",endpoint:$ep} | .arena={enabled:$en,web_url:"https://w",last_live_battle_id:"lb1"}' \
  "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"; }

live_diff() {
  local en="$1"; shift
  seed_live "$en"; printf 'sek' > "$PD/.arena-secret"
  local e; e=$(bash "$STATUS_SH" arena live "$@" 2>/dev/null | strip)
  seed_live "$en"; printf 'sek' > "$PD/.arena-secret"
  local b; b=$(POKEMON_ENGINE=/nope/e.mjs bash "$STATUS_SH" arena live "$@" 2>/dev/null | strip)
  [ "$e" = "$b" ] || { echo "LIVE DIFF (live $*):"; diff <(echo "$b") <(echo "$e"); return 1; }
}

@test "live status (HP/state + charizard moveset)" { setup_live; live_diff true status lb1; }
@test "live status (no arg → last_live_battle_id)" { setup_live; live_diff true status; }
@test "live status (defender awaiting acceptance)" { setup_live; live_diff true status lbwait; }
@test "live status (finished → 🏁, no move list)" { setup_live; live_diff true status lbfin; }
@test "live status (local trainer is defender → defender moveset)" { setup_live; live_diff true status lbdef; }
@test "live invite (sent + spectator url)" { setup_live; live_diff true invite zzz; }
@test "live invite usage (no target)" { setup_live; live_diff true invite; }
@test "live accept (accepted + re-rendered status)" { setup_live; live_diff true accept lb1; }
@test "live move (committed + status render)" { setup_live; live_diff true move "Lance-Flammes"; }
@test "live forfeit" { setup_live; live_diff true forfeit lb1; }
@test "live unknown subcommand" { setup_live; live_diff true wat; }

@test "live not enabled (arena off)" {
  setup_live
  seed_live false; printf 'sek' > "$PD/.arena-secret"
  local e; e=$(bash "$STATUS_SH" arena live status 2>/dev/null | strip)
  seed_live false; printf 'sek' > "$PD/.arena-secret"
  local b; b=$(POKEMON_ENGINE=/nope/e.mjs bash "$STATUS_SH" arena live status 2>/dev/null | strip)
  [ "$e" = "$b" ]
}

@test "live invite persists last_live_battle_id" {
  setup_live
  seed_live true; printf 'sek' > "$PD/.arena-secret"
  run bash "$STATUS_SH" arena live invite zzz
  [ "$status" -eq 0 ]
  [ "$(jq -r '.arena.last_live_battle_id' "$PD/data.json")" = "lb1" ]
}
