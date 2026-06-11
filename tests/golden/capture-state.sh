#!/usr/bin/env bash
# State-transform characterization (Phase R3d-2). Freezes the bash collection
# transforms (team / PC / active manipulation) as JSONL fixtures so the TS port
# (shared/src/collection.ts) can be verified byte-for-byte. These were OUT of
# scope for the R0 engine goldens (they're state→state transforms, not pure
# rule functions).
#
# Each line: {fn, args, now, input, output}. `output` is null when the bash
# function returns non-zero (e.g. pc_to_team_or_active with team full + active
# occupied). Re-run after an INTENTIONAL transform change:
#   bash tests/golden/capture-state.sh   (+ CHANGELOG)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && cd .. && pwd)"
OUT="${STATE_OUT_DIR:-$REPO_ROOT/tests/golden/fixtures}/state_transforms.jsonl"
mkdir -p "$(dirname "$OUT")"

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
export POKEMON_DIR="$WORK"
cp "$REPO_ROOT/lib/data.default.json" "$WORK/data.json"
# shellcheck source=../../lib/lib.sh
source "$REPO_ROOT/lib/lib.sh"

NOW="2026-05-09T00:00:00Z"
: > "$OUT"

# emit <fn> <args-json> <input-state> <output-state-or-empty>
emit() {
  local fn="$1" args="$2" input="$3" output="$4"
  local out_json="null"
  [ -n "$output" ] && out_json="$output"
  jq -cn --arg fn "$fn" --argjson args "$args" --arg now "$NOW" \
         --argjson input "$input" --argjson output "$out_json" \
         '{fn:$fn, args:$args, now:$now, input:$input, output:$output}' >> "$OUT"
}

# An "active" companion + helpers to build states.
active_state() {  # $1 lineage ("null" → JSON null), $2 level, $3 team json, $4 pc json, $5 completed json
  local lin_json; if [ "$1" = "null" ]; then lin_json="null"; else lin_json="\"$1\""; fi
  jq -cn --argjson lin "$lin_json" --argjson lvl "$2" --argjson team "${3:-[]}" \
         --argjson pc "${4:-[]}" --argjson done "${5:-[]}" '{
    version:2, lineage:$lin, is_shiny:false, current_level:$lvl, total_xp:5000000,
    evolution_history:[{level:1,name:"Salamèche"},{level:16,name:"Reptincel"}],
    eevee_form:null, items:{oran_berry:1}, team:$team, pc_storage:$pc, pokedex:{},
    pokedex_wild:{}, badges:[], friendship:30, created_at:"2026-05-01T00:00:00Z",
    lifetime_stats:{total_tokens:0,total_evolutions:0,total_shinies:0,max_level:16,
      lineages_completed:$done,total_compagnons:0,first_shiny_at:null}
  }'
}
mon() {  # $1 lineage, $2 level, $3 stage name
  jq -cn --arg l "$1" --argjson lv "$2" --arg n "$3" '{lineage:$l,is_shiny:false,level:$lv,
    total_xp:1000000,max_stage:$n,evolution_history:[],eevee_form:null,items:{},
    created_at:"2026-05-01T00:00:00Z",completed_at:"2026-05-05T00:00:00Z"}'
}

TEAM2="[$(mon fire 50 Dracaufeu),$(mon water 30 Carabaffe)]"
TEAM6="[$(mon fire 50 A),$(mon water 50 B),$(mon grass 50 C),$(mon electric 50 D),$(mon eevee 50 E),$(mon totodile 50 F)]"
PC1="[$(mon grass 8 Bulbizarre)]"
EGG=$(jq -cn '{version:2,lineage:null,is_shiny:false,current_level:0,total_xp:0,
  evolution_history:[],eevee_form:null,items:{},team:[],pc_storage:[],pokedex:{},
  badges:[],lifetime_stats:{total_compagnons:0,lineages_completed:[]},created_at:"2026-05-01T00:00:00Z"}')

# ── active_to_archive ──
emit active_to_archive '[]' "$(active_state fire 50 "[]" "[]")" "$(pokemon_active_to_archive "$NOW" "$(active_state fire 50 "[]" "[]")")"
emit active_to_archive '[]' "$(active_state fire 100 "$TEAM6" "[]")" "$(pokemon_active_to_archive "$NOW" "$(active_state fire 100 "$TEAM6" "[]")")"
emit active_to_archive '[]' "$EGG" "$(pokemon_active_to_archive "$NOW" "$EGG")"
# lvl<100 with a non-empty team (archive happens, NO lifetime bump) — distinct branch
emit active_to_archive '[]' "$(active_state fire 50 "$TEAM2" "[]")" "$(pokemon_active_to_archive "$NOW" "$(active_state fire 50 "$TEAM2" "[]")")"
# lvl 100 where lineages_completed ALREADY has the lineage (index!=null false branch)
emit active_to_archive '[]' "$(active_state fire 100 "[]" "[]" '["fire"]')" "$(pokemon_active_to_archive "$NOW" "$(active_state fire 100 "[]" "[]" '["fire"]')")"

# ── reset_active ──
emit reset_active '["water"]' "$(active_state fire 50 "[]" "[]")" "$(pokemon_reset_active "$NOW" "$(active_state fire 50 "[]" "[]")" water)"
emit reset_active '[]'        "$(active_state fire 50 "[]" "[]")" "$(pokemon_reset_active "$NOW" "$(active_state fire 50 "[]" "[]")")"

# ── load_team_to_active ──
emit load_team_to_active '[0]' "$(active_state fire 50 "$TEAM2" "[]")" "$(pokemon_load_team_to_active "$NOW" "$(active_state fire 50 "$TEAM2" "[]")" 0)"
emit load_team_to_active '[1]' "$(active_state fire 50 "$TEAM2" "[]")" "$(pokemon_load_team_to_active "$NOW" "$(active_state fire 50 "$TEAM2" "[]")" 1)"

# ── team_to_pc ──
emit team_to_pc '[0]' "$(active_state fire 50 "$TEAM2" "[]")" "$(pokemon_team_to_pc "$(active_state fire 50 "$TEAM2" "[]")" 0)"

# ── pc_to_team_or_active ── (active empty → load to active; active full + space → team; team full → null)
emit pc_to_team_or_active '[0]' "$(active_state "null" 0 "$TEAM2" "$PC1")" "$(pokemon_pc_to_team_or_active "$NOW" "$(active_state "null" 0 "$TEAM2" "$PC1")" 0)"
emit pc_to_team_or_active '[0]' "$(active_state fire 50 "$TEAM2" "$PC1")" "$(pokemon_pc_to_team_or_active "$NOW" "$(active_state fire 50 "$TEAM2" "$PC1")" 0)"
emit pc_to_team_or_active '[0]' "$(active_state fire 50 "$TEAM6" "$PC1")" "$(pokemon_pc_to_team_or_active "$NOW" "$(active_state fire 50 "$TEAM6" "$PC1")" 0 || true)"

# ── release_slot ──
emit release_slot '["team",0]' "$(active_state fire 50 "$TEAM2" "[]")" "$(pokemon_release_slot "$(active_state fire 50 "$TEAM2" "[]")" team 0)"
emit release_slot '["pc",0]'   "$(active_state fire 50 "[]" "$PC1")"   "$(pokemon_release_slot "$(active_state fire 50 "[]" "$PC1")" pc 0)"

echo "Wrote $OUT ($(wc -l < "$OUT") cases)"
