#!/usr/bin/env bats
# Render drift guard (Phase R3a). Re-captures the bash /pokemon views and diffs
# against the committed fixtures. Fails if the render layer drifted — the
# TypeScript coquille port (R3c) is verified against these exact fixtures, so
# they must stay frozen unless a render change is intentional.
#
# To intentionally update : bash tests/render/capture-render.sh + CHANGELOG.

load '../helpers/setup.bash'

@test "render fixtures match the current bash views (no drift)" {
  tmp="$(mktemp -d)"
  RENDER_OUT_DIR="$tmp" bash "$REPO_ROOT/tests/render/capture-render.sh" >/dev/null
  run diff -r "$REPO_ROOT/tests/render/fixtures" "$tmp"
  rm -rf "$tmp"
  if [ "$status" -ne 0 ]; then
    echo "Render drift detected — regenerate with: bash tests/render/capture-render.sh"
    echo "$output"
    false
  fi
}

@test "render fixtures are present" {
  count=$(find "$REPO_ROOT/tests/render/fixtures" -name '*.txt' | wc -l)
  [ "$count" -ge 30 ]
}
