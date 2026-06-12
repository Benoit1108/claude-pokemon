#!/usr/bin/env bats
# Entry-point safety nets (audit cleanup): the corrupt-state guard (a save that
# EXISTS but doesn't parse must be fatal — never silently re-initialized as a
# fresh egg) and the restored stats auto-submit (opt-in, 24h cooldown, detached
# fire-and-forget POST from the statusline tick).

load '../helpers/setup.bash'

setup_entry() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/statusline.mjs" "$REPO_ROOT/lib/pokemon.mjs" "$PD/"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  jq '.language="fr" | .display_sprite_in_statusline="off"' \
    "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
}
teardown() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; [ -n "${TD:-}" ] && rm -rf "$TD"; }

SL_INPUT='{"model":{"display_name":"Sonnet"},"context_window":{"used_percentage":30},"session_id":"s1"}'
STATE='{"version":2,"lineage":"fire","current_level":40,"total_xp":120000000,"xp_rebalance_v2_acknowledged":true,"evolution_history":[{"level":1,"name":"Salamèche"}],"lifetime_stats":{"total_tokens":99}}'

@test "statusline: corrupt state.json is fatal, never overwritten as a fresh egg" {
  setup_entry
  printf '{"lineage":"fire",CORRUPT' > "$PD/state.json"
  run bash -c "printf '%s' '$SL_INPUT' | POKEMON_DIR='$PD' node '$PD/statusline.mjs'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"state.json corrompu"* ]]
  # The corrupt file is untouched — no data loss.
  [ "$(cat "$PD/state.json")" = '{"lineage":"fire",CORRUPT' ]
}

@test "statusline: corrupt data.json is fatal" {
  setup_entry
  printf 'NOT JSON' > "$PD/data.json"
  run bash -c "printf '%s' '$SL_INPUT' | POKEMON_DIR='$PD' node '$PD/statusline.mjs'"
  [ "$status" -eq 0 ]
  [[ "$output" == *"data.json corrompu"* ]]
}

@test "pokemon.mjs: corrupt state.json errors out (exit 1) without touching the save" {
  setup_entry
  printf '{"broken' > "$PD/state.json"
  run bash -c "POKEMON_DIR='$PD' node '$PD/pokemon.mjs' stats"
  [ "$status" -eq 1 ]
  [[ "$output" == *"state.json corrompu"* ]]
  [ "$(cat "$PD/state.json")" = '{"broken' ]
}

@test "statusline: missing state.json is fine (fresh egg init, no guard trip)" {
  setup_entry
  rm -f "$PD/state.json"
  run bash -c "printf '%s' '$SL_INPUT' | POKEMON_DIR='$PD' node '$PD/statusline.mjs'"
  [ "$status" -eq 0 ]
  [[ "$output" != *"corrompu"* ]]
  [ -f "$PD/state.json" ]
}

@test "auto-submit: fires once when due, stamps the cooldown, skips when fresh" {
  setup_entry
  # Mock /v1/submit recording hits.
  node -e '
    const h=require("http");
    const s=h.createServer((q,r)=>{
      let body=""; q.on("data",(c)=>body+=c); q.on("end",()=>{
        require("fs").appendFileSync(process.argv[2], q.url+" "+body.slice(0,80)+"\n");
        r.writeHead(200,{"content-type":"application/json"}); r.end("{\"ok\":true}");
      });
    });
    s.listen(0,()=>require("fs").writeFileSync(process.argv[1], String(s.address().port)));
  ' "$TD/port" "$TD/hits" &
  SRV=$!
  local tries=0; while [ ! -s "$TD/port" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries+1)); done
  local ep="http://localhost:$(cat "$TD/port")"
  jq --arg ep "$ep" '.stats_share={enabled:true,anon_id:"abcd1234",endpoint:$ep,display_name:"Sacha"}' \
    "$PD/data.json" > "$PD/d.tmp" && mv "$PD/d.tmp" "$PD/data.json"
  printf '%s' "$STATE" > "$PD/state.json"

  run bash -c "printf '%s' '$SL_INPUT' | POKEMON_DIR='$PD' node '$PD/statusline.mjs'"
  [ "$status" -eq 0 ]
  # Cooldown stamped in the save.
  [ "$(jq -r '.last_stats_submit_at // ""' "$PD/state.json")" != "" ]
  # The detached child POSTs within a moment.
  tries=0; while [ ! -s "$TD/hits" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries+1)); done
  grep -q "/v1/submit" "$TD/hits"
  grep -q "abcd1234" "$TD/hits"

  # Second tick: within the 24h cooldown → no new hit.
  local hits_before; hits_before=$(wc -l < "$TD/hits")
  run bash -c "printf '%s' '$SL_INPUT' | POKEMON_DIR='$PD' node '$PD/statusline.mjs'"
  sleep 0.5
  [ "$(wc -l < "$TD/hits")" = "$hits_before" ]
}
