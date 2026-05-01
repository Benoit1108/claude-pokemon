#!/usr/bin/env bash
# claude-pokemon diagnostic.
set -euo pipefail

B=$'\033[1m'; R=$'\033[0m'; G=$'\033[32m'; Y=$'\033[33m'; E=$'\033[31m'; D=$'\033[2m'

echo "${B}Diagnostic claude-pokemon${R}"
echo

# Prereqs
echo "${B}Prérequis :${R}"
for tool in jq chafa flock curl awk gifsicle; do
  if command -v "$tool" >/dev/null; then
    printf "  ${G}✓${R} %-10s %s\n" "$tool" "$(command -v "$tool")"
  else
    if [ "$tool" = "gifsicle" ]; then
      printf "  ${Y}-${R} %-10s ${D}optionnel (animations)${R}\n" "$tool"
    else
      printf "  ${E}✗${R} %-10s ${E}MANQUANT${R}\n" "$tool"
    fi
  fi
done

echo
echo "${B}Fichiers :${R}"
for f in "$HOME/.claude/pokemon/data.json" \
         "$HOME/.claude/pokemon/state.json" \
         "$HOME/.claude/pokemon/lib.sh" \
         "$HOME/.claude/statusline-command.sh" \
         "$HOME/.claude/pokemon-status.sh" \
         "$HOME/.claude/skills/pokemon/SKILL.md"; do
  if [ -f "$f" ]; then
    printf "  ${G}✓${R} %s\n" "$f"
  else
    printf "  ${E}✗${R} %s\n" "$f"
  fi
done

echo
echo "${B}Sprites :${R}"
for d in normal shiny; do
  count=$(ls "$HOME/.claude/pokemon/sprites/$d"/*.txt 2>/dev/null | wc -l)
  count_mini=$(ls "$HOME/.claude/pokemon/sprites-mini/$d"/*.txt 2>/dev/null | wc -l)
  printf "  %-10s %d sprites (32x16) + %d mini (24x12)\n" "$d" "$count" "$count_mini"
done

echo
if [ -f "$HOME/.claude/pokemon/state.json" ]; then
  echo "${B}État compagnon :${R}"
  jq -r '
    "  Lignée   : \(.lineage // "—")",
    "  Niveau   : Lv.\(.current_level)",
    "  XP       : \(.total_xp)",
    "  Shiny    : \(.is_shiny)",
    "  Équipe   : \(.team | length)/6",
    "  PC       : \(.pc_storage | length)",
    "  Badges   : \(.badges | length)/12",
    "  Pokédex  : \(.pokedex | length) lignées + \((.pokedex_wild // {}) | length)/151 sauvages"
  ' "$HOME/.claude/pokemon/state.json"
fi

echo
echo "${B}settings.json :${R}"
if [ -f "$HOME/.claude/settings.json" ]; then
  sl=$(jq -r '.statusLine.command // "(non configuré)"' "$HOME/.claude/settings.json")
  echo "  statusLine : $sl"
else
  echo "  ${E}settings.json absent${R}"
fi
echo
