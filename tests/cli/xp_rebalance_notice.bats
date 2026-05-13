#!/usr/bin/env bats
# v1.0.0-beta.7 — one-shot XP curve rebalance notice.
# The notice fires for users whose state.json predates the curve fix
# (= no `xp_rebalance_v2_acknowledged` flag) and have measurable progress.
# After firing once, the flag is persisted and the notice never re-fires.

load '../helpers/setup.bash'

setup() {
  # Lv.5 with some XP — guaranteed to trigger the "has progress" check.
  seed_pokemon_dir fire 5 650000
}

teardown() {
  cleanup_pokemon_dir
}

@test "notice fires once on first /pokemon view after upgrade" {
  run bash "$POKEMON_STATUS_SH"
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" == *"Courbe XP"* ]] || [[ "$out" == *"XP curve rebalanced"* ]]
}

@test "notice sets xp_rebalance_v2_acknowledged flag in state.json" {
  bash "$POKEMON_STATUS_SH" > /dev/null
  acked=$(jq -r '.xp_rebalance_v2_acknowledged' "$POKEMON_DIR/state.json")
  [ "$acked" = "true" ]
}

@test "notice does NOT fire on second view (idempotent)" {
  bash "$POKEMON_STATUS_SH" > /dev/null   # first call — sets the flag
  run bash "$POKEMON_STATUS_SH"           # second call — should be silent
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" != *"Courbe XP rééquilibrée"* ]]
  [[ "$out" != *"XP curve rebalanced"* ]]
}

@test "notice does NOT fire when total_xp < 1000 (fresh state)" {
  # Reset to zero progress and remove the ack flag.
  jq '.total_xp = 0 | del(.xp_rebalance_v2_acknowledged)' \
    "$POKEMON_DIR/state.json" > "$POKEMON_DIR/state.json.tmp"
  mv "$POKEMON_DIR/state.json.tmp" "$POKEMON_DIR/state.json"

  run bash "$POKEMON_STATUS_SH"
  [ "$status" -eq 0 ]
  out=$(strip_ansi "$output")
  [[ "$out" != *"Courbe XP rééquilibrée"* ]]
  [[ "$out" != *"XP curve rebalanced"* ]]
}

@test "new threshold curve : Lv.1 requires 1M XP (egg)" {
  expected=$(jq -r '.thresholds[1]' "$POKEMON_DIR/data.json")
  [ "$expected" = "1000000" ]
}

@test "new threshold curve : monotonic deltas from Lv.1 onwards (no Lv.16 drop)" {
  # Verify there's no point Lv.N→N+1 with smaller delta than Lv.N-1→N,
  # starting from N=2 (= delta[1→2] vs delta[2→3]). The egg breakpoint
  # (delta[0→1]=1M vs delta[1→2]=202K) is intentionally non-monotonic —
  # the egg is a one-shot hatching cost, not a normal level-up.
  result=$(jq -r '
    .thresholds as $t
    | [range(2; $t | length - 1) | {
        lvl: .,
        prev_delta: ($t[.] - $t[. - 1]),
        next_delta: ($t[. + 1] - $t[.])
      } | select(.next_delta < .prev_delta)]
    | length
  ' "$POKEMON_DIR/data.json")
  [ "$result" = "0" ]
}
