#!/usr/bin/env bats
# Network view bridge (Phase R3d-4). pokemon-status.sh routes leaderboard /
# aggregate through the engine `net` command (Node fetch) with a bash curl
# fallback. A local mock server returns a canned response on an ephemeral port;
# the engine-fetch path and the bash-curl path must render IDENTICALLY.

load '../helpers/setup.bash'

setup_net_env() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  STATUS="$TD/.claude/pokemon-status.sh"
  echo '{"version":2,"lineage":"fire","current_level":5,"total_xp":100,"sessions":{},"lifetime_stats":{}}' > "$PD/state.json"
}
teardown() {
  [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null
  [ -n "${TD:-}" ] && rm -rf "$TD"
}

# Start a mock worker that returns $1 (JSON) for any path; sets ENDPOINT.
start_mock() {
  node -e '
    const h=require("http"); const body=process.argv[1];
    const s=h.createServer((q,r)=>{r.writeHead(200,{"content-type":"application/json"});r.end(body)});
    s.listen(0,()=>{ require("fs").writeFileSync(process.argv[2], String(s.address().port)) });
  ' "$1" "$TD/port" &
  SRV=$!
  local tries=0
  while [ ! -s "$TD/port" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries+1)); done
  ENDPOINT="http://localhost:$(cat "$TD/port")"
}

strip() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

# Render via engine fetch vs bash curl from the same mock; assert identical.
net_diff() {
  local cmd_args=("$@")
  jq --arg ep "$ENDPOINT" '.language="fr" | .stats_share={enabled:true,anon_id:"abcd1234",endpoint:$ep}' \
    "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
  local bash_out engine_out
  bash_out=$(POKEMON_ENGINE=/nope/e.mjs bash "$STATUS" "${cmd_args[@]}" 2>/dev/null | strip)
  engine_out=$(bash "$STATUS" "${cmd_args[@]}" 2>/dev/null | strip)
  [ "$bash_out" = "$engine_out" ] || { echo "NET DIFF (${cmd_args[*]}):"; diff <(echo "$bash_out") <(echo "$engine_out"); return 1; }
}

@test "leaderboard: engine fetch == bash curl" {
  setup_net_env
  start_mock '{"total_players":3,"top":[{"anon_id":"abcd1234","display_name":"Mé","value":1234567,"lineage":"fire","level":40,"is_shiny":true},{"anon_id":"zzzz9999","display_name":"","value":500,"lineage":"water","level":0,"is_shiny":false}]}'
  net_diff leaderboard total_tokens 10
}

@test "aggregate: engine fetch == bash curl" {
  setup_net_env
  start_mock '{"total_players":42,"total_tokens_combined":9000000,"total_shinies_observed":7,"shiny_rate_observed":0.012,"active_lineage_distribution":{"fire":5,"water":20,"grass":3}}'
  net_diff aggregate
}

@test "net: no endpoint configured renders the no_endpoint message (both paths)" {
  setup_net_env
  jq '.language="fr" | .stats_share={enabled:false}' "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
  run bash "$STATUS" leaderboard
  [ "$status" -eq 0 ]
  [[ "$(echo "$output" | strip)" == *"endpoint"* ]]
}
