#!/usr/bin/env bash
# Render characterization net (Phase R3a).
#
# Freezes the CURRENT bash render layer (the /pokemon views) as ANSI-stripped
# golden fixtures, so the TypeScript coquille port (R3c) can be verified to
# render identically. Complements tests/golden/ (which covers the rules engine).
#
# Sprites are forced OFF (display_sprite_in_statusline=off) : chafa output is
# environment-dependent and not part of the layout we're porting. Language is
# pinned. Deterministic views only (no network / no RNG).
#
# Re-run after an INTENTIONAL render change : bash tests/render/capture-render.sh
# (+ CHANGELOG). tests/cli/render-golden.bats re-runs this and diffs.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && cd .. && pwd)"
OUT_DIR="${RENDER_OUT_DIR:-$REPO_ROOT/tests/render/fixtures}"
mkdir -p "$OUT_DIR"

# Hermetic install layout in a temp $HOME (mirrors bin/install.sh paths).
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export HOME="$WORK"
export POKEMON_DIR="$WORK/.claude/pokemon"
mkdir -p "$POKEMON_DIR/locales"
cp "$REPO_ROOT/lib/data.default.json" "$POKEMON_DIR/data.json"
cp "$REPO_ROOT/lib/locales/fr.json" "$POKEMON_DIR/locales/fr.json"
cp "$REPO_ROOT/lib/locales/en.json" "$POKEMON_DIR/locales/en.json"
cp "$REPO_ROOT/lib/lib.sh" "$POKEMON_DIR/lib.sh"
cp "$REPO_ROOT/lib/pokemon-status.sh" "$WORK/.claude/pokemon-status.sh"
STATUS_SH="$WORK/.claude/pokemon-status.sh"

# Pin language + force sprites off (env-independent rendering).
jq '.language = "fr" | .display_sprite_in_statusline = "off" | .enable_animations = false' \
  "$POKEMON_DIR/data.json" > "$POKEMON_DIR/data.json.tmp"
mv "$POKEMON_DIR/data.json.tmp" "$POKEMON_DIR/data.json"

strip_ansi() { sed -E 's/\x1b\[[0-9;]*[a-zA-Z]//g'; }

# Write a state.json from a jq filter applied to a stable base.
write_state() {
  local filter="$1"
  jq "$filter" > "$POKEMON_DIR/state.json" <<'BASE'
{
  "version": 2,
  "lineage": "fire",
  "is_shiny": false,
  "current_level": 5,
  "total_xp": 2000000,
  "evolution_history": [],
  "evolution_flash_remaining": 0,
  "eevee_form": null,
  "sessions": {},
  "badges": [],
  "team": [],
  "pc_storage": [],
  "pokedex": {},
  "pokedex_wild": {},
  "items": {},
  "friendship": 0,
  "lifetime_stats": {
    "total_tokens": 0, "total_evolutions": 0, "total_shinies": 0,
    "max_level": 5, "lineages_completed": [], "total_compagnons": 0,
    "games_won": 0, "games_played": 0, "first_shiny_at": null
  },
  "created_at": "2026-05-07T00:00:00Z",
  "last_updated": "2026-05-07T00:00:00Z"
}
BASE
}

# Scenarios : (name, jq filter over the base state).
declare -A SCENARIOS=(
  [starter_lv5]='.'
  [evolved_shiny]='.lineage="cyndaquil" | .current_level=40 | .total_xp=60000000 | .is_shiny=true | .evolution_history=[{"name":"Héricendre"},{"name":"Feurisson"}] | .badges=[{"id":"first_evo","earned_at":"2026-05-08T00:00:00Z"}] | .items={"xp_charm":1,"oran_berry":2} | .friendship=120'
  [full_roster]='.lineage="eevee" | .current_level=30 | .eevee_form="vaporeon" | .team=[{"lineage":"fire","level":16,"total_xp":10000000,"is_shiny":false,"max_stage":"Reptincel","eevee_form":null,"created_at":"2026-05-07T00:00:00Z","completed_at":"2026-05-09T00:00:00Z"},{"lineage":"water","level":36,"total_xp":50000000,"is_shiny":true,"max_stage":"Tortank","eevee_form":null,"created_at":"2026-05-07T00:00:00Z","completed_at":"2026-05-10T00:00:00Z"}] | .pc_storage=[{"lineage":"grass","level":8,"total_xp":3000000,"is_shiny":false,"max_stage":"Bulbizarre","eevee_form":null,"created_at":"2026-05-07T00:00:00Z","completed_at":null}]'
  [egg]='.lineage=null | .current_level=0 | .total_xp=0'
)

VIEWS=(main stats pokedex badges team pc inventory trainer-card recap)

for scenario in "${!SCENARIOS[@]}"; do
  write_state "${SCENARIOS[$scenario]}"
  for view in "${VIEWS[@]}"; do
    # `main` is the default (no subcommand).
    if [ "$view" = "main" ]; then
      bash "$STATUS_SH" 2>/dev/null | strip_ansi > "$OUT_DIR/${scenario}__${view}.txt"
    else
      bash "$STATUS_SH" "$view" 2>/dev/null | strip_ansi > "$OUT_DIR/${scenario}__${view}.txt"
    fi
  done
done

echo "Render fixtures written to $OUT_DIR"
ls -1 "$OUT_DIR" | wc -l | xargs echo "fixture count:"
