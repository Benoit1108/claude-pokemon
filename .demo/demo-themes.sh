#!/usr/bin/env bash
# Scenario themes : montre les 4 thèmes UI (default / dark / light / retro)
# en switchant data.json.theme et en rendant /pokemon stats à chaque fois.
# Le mode retro tinte aussi la palette stage+type → effet GameBoy visible.

set -eu

POKEMON="${HOME}/.claude/pokemon-status.sh"
DATA="${HOME}/.claude/pokemon/data.json"
PROMPT='\033[1;36m$\033[0m '

type() {
  local cmd="$1"
  printf '%b' "$PROMPT"
  for ((i=0; i<${#cmd}; i++)); do
    printf '%s' "${cmd:i:1}"
    sleep 0.04
  done
  printf '\n'
  sleep 0.4
}

set_theme() {
  jq --arg t "$1" '.theme = $t' "$DATA" > "${DATA}.tmp" && mv "${DATA}.tmp" "$DATA"
}

# Save original theme to restore at end
ORIG_THEME=$(jq -r '.theme // "default"' "$DATA")
trap 'set_theme "$ORIG_THEME"' EXIT

clear

type "# claude-pokemon — 4 thèmes UI dans data.json.theme"
sleep 1.5
echo

for theme in default dark light retro; do
  type "# theme = \"$theme\""
  set_theme "$theme"
  sleep 0.5
  type "/pokemon stats"
  bash "$POKEMON" stats 2>&1 | head -14
  sleep 3
  echo
done

type "# data.json.theme accepte : default | dark | light | retro"
sleep 2
