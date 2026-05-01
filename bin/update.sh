#!/usr/bin/env bash
# claude-pokemon update — re-fetch sprites + migrate data.json. Preserves state.json.
set -euo pipefail
ROOT="${CLAUDE_POKEMON_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
TARGET="$HOME/.claude/pokemon"

echo "Update : re-fetch sprites + migration data.json (state.json préservé)"
[ ! -d "$TARGET" ] && { echo "Pas installé. Lance d'abord : npx claude-pokemon install"; exit 1; }

cp "$ROOT/lib/lib.sh" "$TARGET/lib.sh"
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
jq -s '.[0] * .[1]' "$default_data" "$user_data" > "$user_data.tmp" && mv "$user_data.tmp" "$user_data"

echo "✓ Update terminé. Relance Claude Code."
