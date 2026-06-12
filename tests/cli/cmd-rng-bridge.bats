#!/usr/bin/env bats
# RNG command bridge (Phase R3d-4b). `game` + `trade` run via the engine `cmd`
# bridge, which injects randomness as `decisions` (like the tick) so the engine
# is pure. A single-entry wild_pool forces pool_idx → 0, making every game path
# byte-diffable engine-vs-bash; a date shim fixes the clock for cooldowns. The
# trade *pull* also draws a random level/shiny (not data-forceable) → covered by
# shared/tests/commands.test.ts; here we diff its deterministic cooldown path.

load '../helpers/setup.bash'

FIXED="2026-06-11T12:00:00Z"

setup_rng() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales" "$TD/bin"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/pokemon-status.sh" "$TD/.claude/pokemon-status.sh"
  STATUS="$TD/.claude/pokemon-status.sh"
  jq '.wild_pool=[{id:"pikachu",type:"Électrik",national_dex:25,name_fr:"Pikachu",name_en:"Pikachu"}] | .language="fr"' \
    "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
  local ep; ep=$(date -u -d "$FIXED" +%s)
  cat > "$TD/bin/date" <<SHIM
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in -d*|--date*) exec /usr/bin/date "\$@";; esac; done
fmt=""; for a in "\$@"; do case "\$a" in +*) fmt="\$a";; esac; done
exec /usr/bin/date -u -d "@$ep" "\$fmt"
SHIM
  chmod +x "$TD/bin/date"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }
strip() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

# rng_diff <state-json> <subcommand args...> — engine vs forced-bash, from the
# same seed; assert identical stdout AND resulting state.
rng_diff() {
  local st="$1"; shift
  printf '%s' "$st" > "$PD/state.json"
  local e se; e=$(PATH="$TD/bin:$PATH" bash "$STATUS" "$@" 2>/dev/null | strip); se=$(jq -S . "$PD/state.json")
  printf '%s' "$st" > "$PD/state.json"
  local b sb; b=$(PATH="$TD/bin:$PATH" POKEMON_ENGINE=/nope/e.mjs bash "$STATUS" "$@" 2>/dev/null | strip); sb=$(jq -S . "$PD/state.json")
  [ "$e" = "$b" ] || { echo "STDOUT DIFF ($*):"; diff <(echo "$b") <(echo "$e"); return 1; }
  [ "$se" = "$sb" ] || { echo "STATE DIFF ($*):"; diff <(echo "$sb") <(echo "$se"); return 1; }
}

BASE='{"version":2,"lineage":"fire","current_level":40,"total_xp":1000,"friendship":10,"lifetime_stats":{"games_won":0,"games_played":0},"items":{},"team":[],"pc_storage":[]}'
QUIZ='{"version":2,"lineage":"fire","current_level":40,"total_xp":1000,"friendship":10,"lifetime_stats":{"games_won":0,"games_played":0},"items":{},"team":[],"pc_storage":[],"current_quiz":{"id":"pikachu","started_at":"2026-06-11T11:00:00Z"}}'
NOACTIVE='{"version":2,"lineage":"","current_level":0,"total_xp":0,"lifetime_stats":{},"items":{},"team":[],"pc_storage":[]}'

@test "game help: engine == bash" { setup_rng; rng_diff "$BASE" game help; }
@test "game no active companion: engine == bash" { setup_rng; rng_diff "$NOACTIVE" game; }
@test "game new quiz (idx forced 0): engine == bash" { setup_rng; rng_diff "$BASE" game; }
@test "game in progress (hints): engine == bash" { setup_rng; rng_diff "$QUIZ" game; }
@test "game skip: engine == bash" { setup_rng; rng_diff "$QUIZ" game skip; }
@test "game skip with no quiz: engine == bash" { setup_rng; rng_diff "$BASE" game skip; }
@test "game submit correct answer: engine == bash" { setup_rng; rng_diff "$QUIZ" game Pikachu; }
@test "game submit accent-insensitive: engine == bash" { setup_rng; rng_diff "$QUIZ" game pikachu; }
@test "game submit wrong answer: engine == bash" { setup_rng; rng_diff "$QUIZ" game Roucool; }
@test "game submit with no quiz: engine == bash" { setup_rng; rng_diff "$BASE" game Pikachu; }

@test "game cooldown: engine == bash" {
  setup_rng
  local s; s=$(jq -c '.last_game_completed_at="2026-06-11T11:55:00Z"' <<<"$BASE")
  rng_diff "$s" game
}
@test "trade cooldown: engine == bash" {
  setup_rng
  local s; s=$(jq -c '.last_trade_at="2026-06-11T01:00:00Z"' <<<"$BASE")
  rng_diff "$s" trade
}
