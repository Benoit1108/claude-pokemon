# Render scenario definitions (Phase R3a/R3c) — SINGLE SOURCE OF TRUTH.
#
# Sourced by both capture-render.sh (bash backend → freezes the fixtures) and
# render-engine-parity.bats (TS engine backend → must reproduce the same
# fixtures). Keeping the scenario states + view list here means the two
# backends can never drift in their inputs.

# Write a state.json from a jq filter applied to the stable base state.
#   render_write_state <jq-filter> <output-path>
render_write_state() {
  local filter="$1" out="$2"
  jq "$filter" > "$out" <<'BASE'
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

# Scenarios : (name → jq filter over the base state).
declare -A RENDER_SCENARIOS=(
  [starter_lv5]='.'
  [evolved_shiny]='.lineage="cyndaquil" | .current_level=40 | .total_xp=60000000 | .is_shiny=true | .evolution_history=[{"name":"Héricendre"},{"name":"Feurisson"}] | .badges=[{"id":"first_evo","earned_at":"2026-05-08T00:00:00Z"}] | .items={"xp_charm":1,"oran_berry":2} | .friendship=120'
  [full_roster]='.lineage="eevee" | .current_level=30 | .eevee_form="vaporeon" | .team=[{"lineage":"fire","level":16,"total_xp":10000000,"is_shiny":false,"max_stage":"Reptincel","eevee_form":null,"created_at":"2026-05-07T00:00:00Z","completed_at":"2026-05-09T00:00:00Z"},{"lineage":"water","level":36,"total_xp":50000000,"is_shiny":true,"max_stage":"Tortank","eevee_form":null,"created_at":"2026-05-07T00:00:00Z","completed_at":"2026-05-10T00:00:00Z"}] | .pc_storage=[{"lineage":"grass","level":8,"total_xp":3000000,"is_shiny":false,"max_stage":"Bulbizarre","eevee_form":null,"created_at":"2026-05-07T00:00:00Z","completed_at":null}]'
  [egg]='.lineage=null | .current_level=0 | .total_xp=0'
)

RENDER_VIEWS=(main stats pokedex badges team pc inventory trainer-card recap)
