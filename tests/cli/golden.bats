#!/usr/bin/env bats
# Golden drift guard (Phase R0).
# Re-captures the current bash engine behavior and diffs against the committed
# fixtures. Fails if lib.sh rules drifted without regenerating the goldens — the
# TypeScript engine port (Phase R1, ADR-006/007) is verified against these exact
# fixtures, so they must stay frozen unless a rules change is intentional.
#
# To intentionally update : bash tests/golden/capture.sh + a CHANGELOG entry.

load '../helpers/setup.bash'

@test "golden fixtures match the current bash engine (no drift)" {
  tmp="$(mktemp -d)"
  GOLDEN_OUT_DIR="$tmp" bash "$REPO_ROOT/tests/golden/capture.sh" >/dev/null
  run diff -r "$REPO_ROOT/tests/golden/fixtures" "$tmp"
  rm -rf "$tmp"
  if [ "$status" -ne 0 ]; then
    echo "Golden drift detected — regenerate with: bash tests/golden/capture.sh"
    echo "$output"
    false
  fi
}

@test "golden fixtures are present and non-empty" {
  for f in threshold level_from_xp xp_to_next progress_pct xp_multiplier type_match_mult evo_field; do
    [ -s "$REPO_ROOT/tests/golden/fixtures/$f.jsonl" ]
  done
}
