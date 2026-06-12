#!/usr/bin/env bats
# Full Node-native runtime, bash SABOTAGED (Phase R3d-6). Proves the runtime
# never shells out to bash: a fake `bash` (sh stub) is prepended to PATH for the
# Node processes and records any invocation to $HOME/BASH_WAS_CALLED. We run the
# whole lifecycle — install → registered statusline (several ticks) → every
# /pokemon dispatch branch, sprite layouts on — and assert the marker never
# appears. If this is green, the bash scripts can be deleted.

load '../helpers/setup.bash'

setup_nobash() {
  TD="$(mktemp -d)"; export HOME="$TD"
  STUB="$TD/stub"; mkdir -p "$STUB"
  # A non-bash (sh) stub that flags any `bash` invocation, then fails.
  cat > "$STUB/bash" <<'SH'
#!/bin/sh
echo "BASH CALLED: $*" >> "$HOME/BASH_WAS_CALLED"
exit 1
SH
  chmod +x "$STUB/bash"
  # node/git/qrencode resolve via the real PATH (the stub dir only holds bash).
  NB="env PATH=$STUB:$PATH HOME=$TD"
  CP_ROOT="$REPO_ROOT"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }
no_bash() { [ ! -f "$TD/BASH_WAS_CALLED" ] || { echo "bash was invoked:"; cat "$TD/BASH_WAS_CALLED"; return 1; }; }

@test "full Node lifecycle works with bash sabotaged" {
  setup_nobash

  # 1. Install (Node, no bash).
  run $NB CLAUDE_POKEMON_ROOT="$CP_ROOT" node "$CP_ROOT/bin/install.mjs"
  [ "$status" -eq 0 ]
  no_bash
  cmd=$(jq -r '.statusLine.command' "$TD/.claude/settings.json")
  [[ "$cmd" == node*statusline.mjs ]]
  PD="$TD/.claude/pokemon"

  # 2. Registered statusline renders across several ticks (state must evolve).
  for pct in 10 40 75 95; do
    out=$($NB node "$PD/statusline.mjs" <<<"{\"model\":{\"display_name\":\"Opus 4.8 (1M context)\"},\"context_window\":{\"used_percentage\":$pct,\"tokens\":$((pct*5000))},\"effort\":{\"level\":\"high\"},\"session_id\":\"s1\"}")
    [[ "$out" == *"%"* ]]
    no_bash
  done

  # 3. Every /pokemon dispatch branch via the Node entrypoint.
  for sub in "" "team" "pc" "pokedex" "stats" "badges" "inventory" "trainer-card" "recap" "--shiny" "reset" "switch" "hatch fire" "game help" "quote yo" "stats-share" "arena status" "leaderboard" "aggregate"; do
    run $NB node "$PD/pokemon.mjs" $sub
    [ "$status" -eq 0 ] || { echo "FAILED: /pokemon $sub"; echo "$output"; false; }
    no_bash
  done

  # 4. Sprite layouts ON (reads the pre-rendered .txt — no bash).
  for layout in left above; do
    jq --arg l "$layout" '.display_sprite_in_statusline=$l' "$PD/data.json" > "$PD/d.tmp" && mv "$PD/d.tmp" "$PD/data.json"
    out=$($NB node "$PD/statusline.mjs" <<<'{"model":{"display_name":"Sonnet"},"context_window":{"used_percentage":30},"session_id":"s1"}')
    [ -n "$out" ]
    no_bash
  done

  # 5. export / import round-trip + status, via the CLI dispatcher.
  run $NB CLAUDE_POKEMON_ROOT="$CP_ROOT" node "$CP_ROOT/bin/claude-pokemon" export "$TD/bk.json"
  [ "$status" -eq 0 ]; [ -f "$TD/bk.json" ]; no_bash
  run $NB CLAUDE_POKEMON_ROOT="$CP_ROOT" node "$CP_ROOT/bin/claude-pokemon" import "$TD/bk.json"
  [ "$status" -eq 0 ]; no_bash
  run $NB CLAUDE_POKEMON_ROOT="$CP_ROOT" node "$CP_ROOT/bin/claude-pokemon" status
  [ "$status" -eq 0 ]; no_bash
}
