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

# Fetch any missing sprites (new lineages added via merge above)
echo "Vérification des sprites manquants..."
mkdir -p "$TARGET/sprites/normal" "$TARGET/sprites/shiny" \
         "$TARGET/sprites-mini/normal" "$TARGET/sprites-mini/shiny"
ids=$(jq -r '.lineages | to_entries[] | .value.stages[].showdown_id' "$user_data" | sort -u)
dl_count=0
if command -v chafa >/dev/null 2>&1; then
  for variant in normal shiny; do
    url_path="gen5"
    [ "$variant" = "shiny" ] && url_path="gen5-shiny"
    for id in $ids; do
      out_std="$TARGET/sprites/$variant/$id.txt"
      out_mini="$TARGET/sprites-mini/$variant/$id.txt"
      if [ -s "$out_std" ] && [ -s "$out_mini" ]; then continue; fi
      tmp=$(mktemp --suffix=.png)
      if curl -sf -o "$tmp" "https://play.pokemonshowdown.com/sprites/$url_path/$id.png" 2>/dev/null; then
        chafa --size 32x16 --symbols block "$tmp" > "$out_std" 2>/dev/null
        chafa --size 24x12 --symbols block "$tmp" > "$out_mini" 2>/dev/null
        dl_count=$((dl_count+1))
      fi
      rm -f "$tmp"
    done
  done
  echo "  $dl_count nouveaux sprites téléchargés"
else
  echo "  chafa absent — sprites non rafraîchis"
fi

echo "✓ Update terminé. Relance Claude Code."
