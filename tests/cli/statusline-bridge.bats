#!/usr/bin/env bats
# Statusline bridge (Phase R3d-5). The native Node entrypoint lib/statusline.mjs
# (tick in-process + render) must produce output BYTE-IDENTICAL to the bash
# statusline.sh — and because the statusline's colors ARE the contract, this
# diff keeps the ANSI codes (NOT stripped). The tick RNG is neutralized via data
# (event chances 0, single pools, shiny "never") and the clock is pinned (bash
# `date` shim + POKEMON_NOW_EPOCH for Node) so both paths land on the same state.

load '../helpers/setup.bash'

FIXED="2026-06-11T12:00:00Z"

setup_sl() {
  TD="$(mktemp -d)"; export HOME="$TD"
  PD="$TD/.claude/pokemon"; mkdir -p "$PD/locales" "$TD/bin"
  cp "$REPO_ROOT/lib/lib.sh" "$PD/lib.sh"
  cp "$REPO_ROOT/lib/engine.mjs" "$PD/engine.mjs"
  cp "$REPO_ROOT/lib/statusline.mjs" "$PD/statusline.mjs"
  cp "$REPO_ROOT"/lib/locales/*.json "$PD/locales/"
  cp "$REPO_ROOT/lib/statusline.sh" "$TD/.claude/statusline.sh"
  cp -r "$REPO_ROOT/lib/sprites-mini" "$PD/sprites-mini"
  SL="$TD/.claude/statusline.sh"
  EP=$(date -u -d "$FIXED" +%s)
  # Neutralize tick RNG: no events, single pools, never shiny.
  jq '.event_chances.berry=0 | .event_chances.encounter=0 | .shiny_mode="never"
      | .enable_animations=false
      | .berries=[(.berries[0])] | .items=(.items | {(keys[0]): .[keys[0]]})' \
    "$REPO_ROOT/lib/data.default.json" > "$PD/data.json"
  cat > "$TD/bin/date" <<SHIM
#!/usr/bin/env bash
for a in "\$@"; do case "\$a" in -d*|--date*) exec /usr/bin/date "\$@";; esac; done
fmt=""; for a in "\$@"; do case "\$a" in +*) fmt="\$a";; esac; done
exec /usr/bin/date -u -d "@$EP" "\$fmt"
SHIM
  chmod +x "$TD/bin/date"
}
teardown() { [ -n "${TD:-}" ] && rm -rf "$TD"; }

STATE='{"version":2,"lineage":"fire","current_level":40,"total_xp":120000000,"is_shiny":false,"evolution_flash_remaining":0,"evolution_history":[{"level":1,"name":"Salamèche"},{"level":16,"name":"Reptincel"},{"level":36,"name":"Dracaufeu"}],"sessions":{"s1":{"last_seen":"2026-06-11T11:00:00Z","first_seen":"2026-06-11T10:00:00Z","last_tick_tokens":0}},"badges":[],"team":[],"pc_storage":[],"pokedex":{},"items":{},"friendship":10,"lifetime_stats":{"total_tokens":100,"total_evolutions":2,"total_shinies":0,"max_level":40},"xp_rebalance_v2_acknowledged":true,"created_at":"2026-06-01T00:00:00Z"}'

# Diff bash statusline.sh vs node statusline.mjs for a given input + state.
# Keeps ANSI (colors are the contract). cwd is a non-git dir → empty branch on
# both sides.
sl_diff() {
  local input="$1" st="${2:-$STATE}"
  printf '%s' "$st" > "$PD/state.json"
  local b; b=$(printf '%s' "$input" | PATH="$TD/bin:$PATH" bash "$SL")
  printf '%s' "$st" > "$PD/state.json"
  local e; e=$(printf '%s' "$input" | POKEMON_NOW_EPOCH="$EP" POKEMON_DIR="$PD" node "$PD/statusline.mjs")
  [ "$b" = "$e" ] || {
    echo "STATUSLINE DIFF:"; diff <(printf '%s' "$b" | cat -v) <(printf '%s' "$e" | cat -v); return 1;
  }
}

inp() { # used%, model, effort, sprite-layout
  jq -cn --arg dir "$TD" --arg m "$2" --argjson u "$1" --arg e "$3" \
    '{workspace:{current_dir:$dir,project_dir:$dir}, model:{display_name:$m},
      context_window:{used_percentage:$u, tokens:50000}, effort:{level:$e}, session_id:"s1"}'
}
with_layout() { jq --arg l "$1" '.display_sprite_in_statusline=$l' "$PD/data.json" > "$PD/d.tmp" && mv "$PD/d.tmp" "$PD/data.json"; }

@test "statusline: basic (sprite off, 30%, medium)" { setup_sl; with_layout off; sl_diff "$(inp 30 "Sonnet 4.6" medium)"; }
@test "statusline: high context gauge (90%, max effort)" { setup_sl; with_layout off; sl_diff "$(inp 90 "Opus 4.8 (1M context)" max)"; }
@test "statusline: low effort, no effort variations" { setup_sl; with_layout off; sl_diff "$(inp 50 "Haiku" low)"; }
@test "statusline: sprite layout left" { setup_sl; with_layout left; sl_diff "$(inp 45 "Sonnet" high)"; }
@test "statusline: sprite layout above" { setup_sl; with_layout above; sl_diff "$(inp 45 "Sonnet" high)"; }
@test "statusline: shiny companion" {
  setup_sl; with_layout off
  sl_diff "$(inp 30 "Sonnet" medium)" "$(jq -c '.is_shiny=true' <<<"$STATE")"
}
@test "statusline: evolution flash (sparkle)" {
  setup_sl; with_layout off
  sl_diff "$(inp 30 "Sonnet" medium)" "$(jq -c '.evolution_flash_remaining=3' <<<"$STATE")"
}
@test "statusline: no used percentage (no gauge)" {
  setup_sl; with_layout off
  sl_diff "$(jq -cn --arg dir "$TD" '{workspace:{current_dir:$dir}, model:{display_name:"Sonnet"}, session_id:"s1"}')"
}
