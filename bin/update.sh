#!/usr/bin/env bash
# claude-pokemon update — re-fetch sprites + migrate data.json. Preserves state.json.
set -euo pipefail
ROOT="${CLAUDE_POKEMON_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TARGET="$HOME/.claude/pokemon"

echo "Update : re-fetch sprites + migration data.json (state.json préservé)"
[ ! -d "$TARGET" ] && { echo "Pas installé. Lance d'abord : npx claude-pokemon install"; exit 1; }

cp "$ROOT/lib/lib.sh" "$TARGET/lib.sh"
cp "$ROOT/lib/engine.mjs" "$TARGET/engine.mjs"
cp "$ROOT/lib/locales/fr.json" "$TARGET/locales/fr.json"
cp "$ROOT/lib/locales/en.json" "$TARGET/locales/en.json"
cp "$ROOT/lib/statusline.sh" "$HOME/.claude/statusline-command.sh"
cp "$ROOT/lib/pokemon-status.sh" "$HOME/.claude/pokemon-status.sh"
chmod +x "$HOME/.claude/statusline-command.sh" "$HOME/.claude/pokemon-status.sh"
cp "$ROOT/skills/pokemon/SKILL.md" "$HOME/.claude/skills/pokemon/SKILL.md"

# Merge new data.json fields into existing user data.json
echo "Merge data.json (préserve customisations)..."
default_data="$ROOT/lib/data.default.json"
user_data="$TARGET/data.json"
# Force-propagate game-design constants + content arrays from defaults.
# (user customisations don't apply to balance / metadata / pokédex content.)
# Note: jq's `*` recursively merges objects but OVERWRITES arrays, so without
# explicit override here `wild_pool` extensions would never reach existing users.
# Everything else: user wins via the standard `*` recursive merge.
jq -s '
  .[0] * .[1] * {
    thresholds: .[0].thresholds,
    version:    .[0].version,
    wild_pool:  .[0].wild_pool
  }
' "$default_data" "$user_data" > "$user_data.tmp" && mv "$user_data.tmp" "$user_data"

# Refresh sprites from the package's pre-rendered set (Phase R3d-5) — no chafa
# nor network needed; the .txt ship in the tarball.
echo "Mise à jour des sprites (pré-rendus)..."
sprite_count=0
for variant in normal shiny; do
  for sub in sprites sprites-mini; do
    src="$ROOT/lib/$sub/$variant"
    [ -d "$src" ] || continue
    mkdir -p "$TARGET/$sub/$variant"
    for f in "$src"/*.txt; do
      [ -e "$f" ] || continue
      cp "$f" "$TARGET/$sub/$variant/"
      [ "$sub" = "sprites" ] && sprite_count=$((sprite_count + 1))
    done
  done
done
echo "  $sprite_count sprites synchronisés"

echo "✓ Update terminé. Relance Claude Code."
