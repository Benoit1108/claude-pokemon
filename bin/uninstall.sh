#!/usr/bin/env bash
# claude-pokemon uninstaller. Removes data, scripts, skill, and statusLine entry.
# Creates backups before deletion.

set -euo pipefail

B=$'\033[1m'; R=$'\033[0m'; G=$'\033[32m'; Y=$'\033[33m'; D=$'\033[2m'

echo
echo "${B}Désinstallation claude-pokemon${R}"
echo
echo "${Y}⚠ Cette action va supprimer :${R}"
echo "  - ~/.claude/pokemon/ (données + sprites)"
echo "  - ~/.claude/statusline-command.sh"
echo "  - ~/.claude/pokemon-status.sh"
echo "  - ~/.claude/skills/pokemon/"
echo "  - L'entrée statusLine dans ~/.claude/settings.json"
echo
echo "${D}Des backups (.bak-uninstall-...) seront créés.${R}"
echo

if [ "${1:-}" != "--confirm" ]; then
  echo "Pour confirmer : ${B}npx claude-pokemon uninstall --confirm${R}"
  exit 0
fi

ts=$(date +%Y%m%d-%H%M%S)
mkdir -p "$HOME/.claude/backups"

# Backup pokemon dir
if [ -d "$HOME/.claude/pokemon" ]; then
  tar czf "$HOME/.claude/backups/pokemon-$ts.tar.gz" -C "$HOME/.claude" pokemon 2>/dev/null
  rm -rf "$HOME/.claude/pokemon"
  echo "${G}✓${R} ~/.claude/pokemon/ supprimé (backup → .claude/backups/)"
fi

for f in "$HOME/.claude/statusline-command.sh" "$HOME/.claude/pokemon-status.sh"; do
  [ -f "$f" ] && { mv "$f" "${f}.bak-uninstall-$ts"; echo "${G}✓${R} $f sauvegardé"; }
done

if [ -d "$HOME/.claude/skills/pokemon" ]; then
  mv "$HOME/.claude/skills/pokemon" "$HOME/.claude/skills/pokemon.bak-uninstall-$ts"
  echo "${G}✓${R} skill pokemon sauvegardé"
fi

if [ -f "$HOME/.claude/settings.json" ]; then
  cp "$HOME/.claude/settings.json" "$HOME/.claude/settings.json.bak-uninstall-$ts"
  jq 'del(.statusLine)' "$HOME/.claude/settings.json" > "$HOME/.claude/settings.json.tmp" \
    && mv "$HOME/.claude/settings.json.tmp" "$HOME/.claude/settings.json"
  echo "${G}✓${R} settings.json — statusLine retirée (backup créé)"
fi

echo
echo "${B}Désinstallation terminée.${R} Tes backups sont dans ~/.claude/backups/ et avec suffixe .bak-uninstall-$ts."
