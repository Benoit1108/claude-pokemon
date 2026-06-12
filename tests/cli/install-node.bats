#!/usr/bin/env bats
# Native Node install tooling (Phase R3d-5 piece 4). install/update/uninstall/
# status .mjs are the Windows-native (bash-free) equivalents of the bin/*.sh
# scripts. Run them against a throwaway HOME and assert the structural outcome:
# files copied, state/data initialised, statusLine registered to the NODE
# entrypoint, idempotency, migration, and clean uninstall.

load '../helpers/setup.bash'

setup_node_install() {
  TD="$(mktemp -d)"; export HOME="$TD"
  export CLAUDE_POKEMON_ROOT="$REPO_ROOT"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }

@test "install.mjs sets up the Node-native runtime + statusLine" {
  setup_node_install
  run node "$REPO_ROOT/bin/install.mjs"
  [ "$status" -eq 0 ]
  # Split model: game CONTENT (package-fresh) + small user CONFIG overlay.
  for f in statusline.mjs pokemon.mjs content.json config.json state.json locales/fr.json locales/en.json; do
    [ -f "$TD/.claude/pokemon/$f" ] || { echo "missing $f"; false; }
  done
  [ -f "$TD/.claude/pokemon/sprites/normal/charmander.txt" ]
  [ -f "$TD/.claude/pokemon/sprites-mini/shiny/pikachu.txt" ]
  [ -f "$TD/.claude/skills/pokemon/SKILL.md" ]
  # statusLine registered to the Node entrypoint.
  cmd=$(jq -r '.statusLine.command' "$TD/.claude/settings.json")
  [[ "$cmd" == node* ]]
  [[ "$cmd" == *statusline.mjs ]]
  # state.json is a fresh egg; fresh config is an empty overlay.
  [ "$(jq -r '.current_level' "$TD/.claude/pokemon/state.json")" = "0" ]
  [ "$(jq -r 'keys | length' "$TD/.claude/pokemon/config.json")" = "0" ]
  [ "$(jq -r '.wild_pool | length' "$TD/.claude/pokemon/content.json")" -gt 200 ]
}

@test "install.mjs is idempotent (preserves state.json)" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  jq '.current_level=42 | .lineage="fire"' "$TD/.claude/pokemon/state.json" > "$TD/s.tmp"
  mv "$TD/s.tmp" "$TD/.claude/pokemon/state.json"
  run node "$REPO_ROOT/bin/install.mjs"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.current_level' "$TD/.claude/pokemon/state.json")" = "42" ]
  # settings.json backup created on re-install.
  ls "$TD/.claude/settings.json.bak-pokemon-"* >/dev/null
}

@test "install.mjs backs up an existing settings.json + keeps other keys" {
  setup_node_install
  mkdir -p "$TD/.claude"
  echo '{"theme":"dark","statusLine":{"type":"command","command":"old"}}' > "$TD/.claude/settings.json"
  run node "$REPO_ROOT/bin/install.mjs"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.theme' "$TD/.claude/settings.json")" = "dark" ]
  [[ "$(jq -r '.statusLine.command' "$TD/.claude/settings.json")" == *statusline.mjs ]]
}

@test "update.mjs refreshes content + preserves config/state (no merge)" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  jq '.current_level=50' "$TD/.claude/pokemon/state.json" > "$TD/s.tmp"; mv "$TD/s.tmp" "$TD/.claude/pokemon/state.json"
  echo '{"language":"en","theme":"retro"}' > "$TD/.claude/pokemon/config.json"
  # Mangle the content: update must restore it package-fresh (no user-wins merge).
  jq '.thresholds=[0,1]' "$TD/.claude/pokemon/content.json" > "$TD/c.tmp"; mv "$TD/c.tmp" "$TD/.claude/pokemon/content.json"
  run node "$REPO_ROOT/bin/update.mjs"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.current_level' "$TD/.claude/pokemon/state.json")" = "50" ]            # state preserved
  [ "$(jq -r '.language' "$TD/.claude/pokemon/config.json")" = "en" ]                # config preserved
  [ "$(jq -r '.thresholds | length' "$TD/.claude/pokemon/content.json")" -gt 2 ]     # content fresh
}

@test "legacy data.json install: runtime keeps working, install migrates it" {
  setup_node_install
  mkdir -p "$TD/.claude/pokemon/locales"
  cp "$REPO_ROOT"/lib/locales/*.json "$TD/.claude/pokemon/locales/"
  cp "$REPO_ROOT/lib/pokemon.mjs" "$TD/.claude/pokemon/pokemon.mjs"
  # A pre-split install: single data.json with user customisations inside.
  jq '.language="en" | .stats_share={enabled:true,anon_id:"abcd1234",endpoint:"https://x"}' \
    "$REPO_ROOT/lib/data.default.json" > "$TD/.claude/pokemon/data.json"
  echo '{"version":2,"lineage":"fire","current_level":7,"total_xp":2000000,"xp_rebalance_v2_acknowledged":true,"evolution_history":[{"level":1,"name":"Charmander"}],"lifetime_stats":{}}' > "$TD/.claude/pokemon/state.json"
  # 1. LEGACY mode: pokemon.mjs reads the old data.json as-is (EN locale).
  run bash -c "POKEMON_DIR='$TD/.claude/pokemon' node '$TD/.claude/pokemon/pokemon.mjs' stats"
  [ "$status" -eq 0 ]
  [[ "$output" == *"LIFETIME"* || "$output" == *"STAT"* ]]
  # 2. install migrates: config.json carries the user keys, content fresh, backup kept.
  run node "$REPO_ROOT/bin/install.mjs"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.language' "$TD/.claude/pokemon/config.json")" = "en" ]
  [ "$(jq -r '.stats_share.anon_id' "$TD/.claude/pokemon/config.json")" = "abcd1234" ]
  [ "$(jq -r 'has("wild_pool")' "$TD/.claude/pokemon/config.json")" = "false" ]   # content keys dropped
  [ -f "$TD/.claude/pokemon/data.json.pre-split.bak" ]
  [ ! -f "$TD/.claude/pokemon/data.json" ]
  # 3. SPLIT mode: runtime reads content ⊕ config (still EN), state intact.
  run bash -c "POKEMON_DIR='$TD/.claude/pokemon' node '$TD/.claude/pokemon/pokemon.mjs' stats"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.current_level' "$TD/.claude/pokemon/state.json")" = "7" ]
}

@test "split mode: runtime config writes land in config.json, never content.json" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  local PD="$TD/.claude/pokemon"
  local content_before; content_before=$(md5sum "$PD/content.json" | cut -d' ' -f1)
  echo '{"version":2,"lineage":"fire","current_level":7,"total_xp":2000000,"xp_rebalance_v2_acknowledged":true,"evolution_history":[],"lifetime_stats":{}}' > "$PD/state.json"
  run bash -c "POKEMON_DIR='$PD' node '$PD/pokemon.mjs' quote 'hello world'"
  [ "$status" -eq 0 ]
  [ "$(jq -r '.stats_share.quote' "$PD/config.json")" = "hello world" ]
  [ "$(md5sum "$PD/content.json" | cut -d' ' -f1)" = "$content_before" ]   # content untouched
}

@test "status.mjs reports the install + statusLine" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  run node "$REPO_ROOT/bin/status.mjs"
  [ "$status" -eq 0 ]
  [[ "$output" == *"statusline.mjs"* ]]
  [[ "$output" == *"sprites pré-rendus"* ]]
}

@test "uninstall.mjs --confirm removes the install + statusLine (with backups)" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  run node "$REPO_ROOT/bin/uninstall.mjs" --confirm
  [ "$status" -eq 0 ]
  [ ! -d "$TD/.claude/pokemon" ]
  [ "$(jq -r '.statusLine // "gone"' "$TD/.claude/settings.json")" = "gone" ]
  ls "$TD/.claude/backups/pokemon-"* >/dev/null
}

@test "uninstall.mjs without --confirm is a no-op" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  run node "$REPO_ROOT/bin/uninstall.mjs"
  [ "$status" -eq 0 ]
  [ -d "$TD/.claude/pokemon" ]
}

# ── Flip (piece 5): bin/claude-pokemon prefers the .mjs commands ───────────────
@test "claude-pokemon CLI routes install → install.mjs (Node-native)" {
  setup_node_install
  run node "$REPO_ROOT/bin/claude-pokemon" install
  [ "$status" -eq 0 ]
  [[ "$(jq -r '.statusLine.command' "$TD/.claude/settings.json")" == *statusline.mjs ]]
}
@test "claude-pokemon CLI export + import via .mjs" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  run node "$REPO_ROOT/bin/claude-pokemon" export "$TD/backup.json"
  [ "$status" -eq 0 ]
  [ -f "$TD/backup.json" ]
  run node "$REPO_ROOT/bin/claude-pokemon" import "$TD/backup.json"
  [ "$status" -eq 0 ]
}
@test "claude-pokemon CLI status + uninstall via .mjs" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  run node "$REPO_ROOT/bin/claude-pokemon" status
  [ "$status" -eq 0 ]
  run node "$REPO_ROOT/bin/claude-pokemon" uninstall --confirm
  [ "$status" -eq 0 ]
  [ ! -d "$TD/.claude/pokemon" ]
}
@test "export.mjs without an install errors cleanly (no stack trace)" {
  setup_node_install
  run node "$REPO_ROOT/bin/export.mjs" "$TD/x.json"
  [ "$status" -eq 1 ]
  [[ "$output" == *"introuvable"* ]]
  [[ "$output" != *"    at "* ]]
}

@test "end-to-end: registered Node statusline renders + pokemon.mjs dispatches" {
  setup_node_install
  node "$REPO_ROOT/bin/install.mjs" >/dev/null
  # The registered statusLine command is `node <dir>/statusline.mjs`.
  cmd=$(jq -r '.statusLine.command' "$TD/.claude/settings.json")
  run bash -c "echo '{\"model\":{\"display_name\":\"Sonnet\"},\"context_window\":{\"used_percentage\":30},\"session_id\":\"s1\"}' | $cmd"
  [ "$status" -eq 0 ]
  [[ "$output" == *"%"* ]]
  # /pokemon dispatch through the Node entrypoint.
  run node "$TD/.claude/pokemon/pokemon.mjs" stats
  [ "$status" -eq 0 ]
  [[ "$output" == *"STATISTIQUES"* || "$output" == *"STATS"* ]]
}
