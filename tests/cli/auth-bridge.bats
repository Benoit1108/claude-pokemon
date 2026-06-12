#!/usr/bin/env bats
# Auth bridge (Phase R3d-4b). `login` / `logout` run through the engine
# (shared/src/auth.ts): login streams progress to the tty + emits a session-op
# on stdout, logout does the best-effort revoke + session-clear op. bash owns
# the .session file. The full device flow needs real GitHub + human auth (so
# its happy path is covered by shared vitest, not here); these diff the offline
# guard paths byte-exact engine-vs-bash, plus the logout revoke + clear.

load '../helpers/setup.bash'

setup_auth() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  STATUS_SH="$TD/.claude/pokemon-status.sh"
  echo '{"version":2,"lineage":"fire","current_level":40}' > "$PD/state.json"
  jq -n '.language="fr" | .stats_share={enabled:true,anon_id:"abcd1234",endpoint:""}' > "$PD/data.json"
}
teardown() { [ -n "${SRV:-}" ] && kill "$SRV" 2>/dev/null; [ -n "${TD:-}" ] && rm -rf "$TD"; }

# engine path (engine.mjs present) vs forced-bash path (POKEMON_ENGINE=/nope),
# stdout+stderr merged. Re-seeds the .session between runs for parity.
seed_session() {
  if [ -n "$1" ]; then printf '%s' "$1" > "$PD/.session"; else rm -f "$PD/.session"; fi
}
auth_diff() {
  local session="$1"; shift
  local e b ec bc
  seed_session "$session"
  e=$(bash "$STATUS_SH" "$@" 2>&1) && ec=0 || ec=$?
  seed_session "$session"
  b=$(POKEMON_ENGINE=/nope/e.mjs bash "$STATUS_SH" "$@" 2>&1) && bc=0 || bc=$?
  if [ "$e" != "$b" ]; then echo "AUTH DIFF ($*):"; diff <(echo "$b") <(echo "$e"); return 1; fi
  if [ "$ec" != "$bc" ]; then echo "AUTH EXIT DIFF ($*): bash=$bc engine=$ec"; return 1; fi
}

@test "login no-endpoint: engine == bash (msg + exit code)" {
  setup_auth
  auth_diff "" login
}

@test "logout not-logged-in: engine == bash" {
  setup_auth
  auth_diff "" logout
}

@test "logout clears session (no endpoint): engine == bash" {
  setup_auth
  auth_diff "deadbeef" logout
}

@test "logout (engine) clears the session file" {
  setup_auth
  printf 'deadbeef' > "$PD/.session"
  run bash "$STATUS_SH" logout
  [ "$status" -eq 0 ]
  [[ "$output" == *"Logged out"* ]]
  [ ! -f "$PD/.session" ]
}

@test "logout (engine) hits the revoke endpoint then clears" {
  setup_auth
  node -e '
    const h=require("http");
    const s=h.createServer((q,r)=>{
      require("fs").appendFileSync(process.argv[2], q.method+" "+q.url+" "+(q.headers.authorization||"")+"\n");
      r.writeHead(200,{"content-type":"application/json"}); r.end("{\"ok\":true}");
    });
    s.listen(0,()=>require("fs").writeFileSync(process.argv[1], String(s.address().port)));
  ' "$TD/port" "$TD/hits" &
  SRV=$!
  local tries=0; while [ ! -s "$TD/port" ] && [ "$tries" -lt 50 ]; do sleep 0.1; tries=$((tries+1)); done
  local ep="http://localhost:$(cat "$TD/port")"
  jq --arg ep "$ep" '.stats_share.endpoint=$ep' "$PD/data.json" > "$PD/data.json.tmp" && mv "$PD/data.json.tmp" "$PD/data.json"
  printf 'sektoken' > "$PD/.session"
  run bash "$STATUS_SH" logout
  [ "$status" -eq 0 ]
  [[ "$output" == *"Logged out"* ]]
  [ ! -f "$PD/.session" ]
  grep -q "/v1/auth/logout Bearer sektoken" "$TD/hits"
}
