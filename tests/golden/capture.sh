#!/usr/bin/env bash
# Golden capture — freezes the CURRENT bash engine behavior as JSONL fixtures.
#
# Why: Phase R ports the rules engine from bash to TypeScript (`packages/shared`,
# ADR-006/007). These fixtures are the contract — the TS port must reproduce
# every (input → output) line exactly. `tests/cli/golden.bats` re-runs this and
# diffs against the committed fixtures, so accidental drift in lib.sh fails CI.
#
# Re-run after an INTENTIONAL rules change (XP curve, evolution stages, …):
#   bash tests/golden/capture.sh   # regenerates tests/golden/fixtures/*.jsonl
# …and add a CHANGELOG entry explaining the new numbers.
#
# Captures only the deterministic, (near-)pure functions. RNG-driven ones
# (pokemon_roll_shiny, pokemon_pick_starter random mode) and the side-effecting
# pokemon_tick battle path are out of scope here — they're covered separately.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && cd .. && pwd)"
OUT_DIR="${GOLDEN_OUT_DIR:-$REPO_ROOT/tests/golden/fixtures}"
mkdir -p "$OUT_DIR"

# Hermetic data/state dir — never touches the user's ~/.claude/pokemon.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
export POKEMON_DIR="$WORK"
cp "$REPO_ROOT/lib/data.default.json" "$WORK/data.json"
write_state() {  # $1 = lineage, $2 = eevee_form (or "null")
  local form_json
  if [ "$2" = "null" ]; then form_json="null"; else form_json="\"$2\""; fi
  cat > "$WORK/state.json" <<EOF
{ "version": 2, "lineage": "$1", "is_shiny": false, "current_level": 1,
  "total_xp": 0, "eevee_form": $form_json, "lifetime_stats": {"total_shinies": 0} }
EOF
}
write_state fire null

# shellcheck source=../../lib/lib.sh
source "$REPO_ROOT/lib/lib.sh"

# Record one case as a JSONL line: emit <outfile> <result-string> <jq-key/val…>
emit() {
  local outfile="$1" result="$2"; shift 2
  jq -cn --arg result "$result" "$@" '($ARGS.named | del(.result)) + {result: $result}' >> "$outfile"
}

MAXL=$(pokemon_max_level)
mapfile -t TH < <(jq -r '.thresholds[]' "$WORK/data.json")
LINEAGES=(chikorita cyndaquil eevee electric fire grass totodile water)

# ── 1. thresholds[level] ─────────────────────────────────────────────────────
: > "$OUT_DIR/threshold.jsonl"
for lvl in $(seq 0 "$MAXL"); do
  emit "$OUT_DIR/threshold.jsonl" "$(pokemon_threshold "$lvl")" --argjson level "$lvl"
done

# ── 2. level from total_xp (probe each threshold boundary: t-1, t, t+1) ──────
: > "$OUT_DIR/level_from_xp.jsonl"
declare -A SEEN=()
probe_level() {
  local xp="$1"
  [ "$xp" -lt 0 ] && return
  [ -n "${SEEN[$xp]:-}" ] && return
  SEEN[$xp]=1
  emit "$OUT_DIR/level_from_xp.jsonl" "$(pokemon_compute_level_from_xp "$xp")" --argjson total_xp "$xp"
}
for i in $(seq 0 "$MAXL"); do
  t="${TH[$i]}"
  probe_level "$((t - 1))"
  probe_level "$t"
  probe_level "$((t + 1))"
done

# ── 3. xp_to_next + progress_pct over (total_xp, level) pairs ─────────────────
: > "$OUT_DIR/xp_to_next.jsonl"
: > "$OUT_DIR/progress_pct.jsonl"
for lvl in $(seq 0 "$MAXL"); do
  start="${TH[$lvl]}"
  pairs=("$start")
  if [ "$lvl" -lt "$MAXL" ]; then
    nxt="${TH[$((lvl + 1))]}"
    pairs+=("$(( start + (nxt - start) / 2 ))")   # mid-level
  fi
  for xp in "${pairs[@]}"; do
    emit "$OUT_DIR/xp_to_next.jsonl"   "$(pokemon_xp_to_next "$xp" "$lvl")"   --argjson total_xp "$xp" --argjson level "$lvl"
    emit "$OUT_DIR/progress_pct.jsonl" "$(pokemon_progress_pct "$xp" "$lvl")" --argjson total_xp "$xp" --argjson level "$lvl"
  done
done

# ── 4. context xp_multiplier (band boundaries + null) ────────────────────────
: > "$OUT_DIR/xp_multiplier.jsonl"
for pct in "" 0 10 24 25 26 40 49 50 51 60 74 75 76 90 100; do
  if [ -z "$pct" ]; then
    emit "$OUT_DIR/xp_multiplier.jsonl" "$(pokemon_xp_multiplier "")" --arg used_pct ""
  else
    emit "$OUT_DIR/xp_multiplier.jsonl" "$(pokemon_xp_multiplier "$pct")" --argjson used_pct "$pct"
  fi
done

# ── 5. lineage type_match_mult (lineage × context band) ──────────────────────
: > "$OUT_DIR/type_match_mult.jsonl"
for lin in "${LINEAGES[@]}"; do
  for pct in 20 29 30 40 50 60 70 71 80; do
    emit "$OUT_DIR/type_match_mult.jsonl" "$(pokemon_type_match_mult "$lin" "$pct")" --arg lineage "$lin" --argjson used_pct "$pct"
  done
done

# ── 6. evolution stage resolution (showdown_id per lineage × level) ──────────
: > "$OUT_DIR/evo_field.jsonl"
EVO_LEVELS=(0 1 5 8 10 12 16 18 20 22 25 30 32 36 40 45 50 60 100)
for lin in "${LINEAGES[@]}"; do
  write_state "$lin" null
  for lvl in "${EVO_LEVELS[@]}"; do
    emit "$OUT_DIR/evo_field.jsonl" "$(pokemon_evo_field "$lin" "$lvl" showdown_id)" \
      --arg lineage "$lin" --argjson level "$lvl" --arg eevee_form ""
  done
done
# Eevee Lv.30+ resolves via state.eevee_form — capture each chosen form.
for form in vaporeon jolteon flareon espeon umbreon; do
  write_state eevee "$form"
  for lvl in 30 50 100; do
    emit "$OUT_DIR/evo_field.jsonl" "$(pokemon_evo_field eevee "$lvl" showdown_id)" \
      --arg lineage eevee --argjson level "$lvl" --arg eevee_form "$form"
  done
done

echo "Golden fixtures written to $OUT_DIR"
ls -1 "$OUT_DIR"
