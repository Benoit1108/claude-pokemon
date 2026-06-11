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

# Scenario states + view list — shared with the TS-engine parity test.
# shellcheck source=scenarios.sh
source "$REPO_ROOT/tests/render/scenarios.sh"

for scenario in "${!RENDER_SCENARIOS[@]}"; do
  render_write_state "${RENDER_SCENARIOS[$scenario]}" "$POKEMON_DIR/state.json"
  for view in "${RENDER_VIEWS[@]}"; do
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
