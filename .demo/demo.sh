#!/usr/bin/env bash
# Scenario rejoué pendant la capture asciinema.
# Toutes les commandes utilisent ~/.claude/pokemon-status.sh (état utilisateur).
# Les `sleep` sont calibrés pour donner le temps de lire chaque vue.

set -eu

POKEMON="${HOME}/.claude/pokemon-status.sh"
STATUSLINE="${HOME}/.claude/statusline-command.sh"
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

clear

# ── 1. La statusline ─────────────────────────────────────────────────────────
type "# Voici la statusline qui apparaît dans Claude Code :"
sleep 1
echo '{"session_id":"demo-cast","model":{"id":"claude-opus-4-7","display_name":"Claude Opus 4.7"},"workspace":{"current_dir":"/home/dev/my-project"},"transcript_path":"/tmp/demo"}' \
  | bash "$STATUSLINE"
echo
sleep 3

# ── 2. Vue principale /pokemon ───────────────────────────────────────────────
type "/pokemon"
bash "$POKEMON"
sleep 4

# ── 3. Équipe ────────────────────────────────────────────────────────────────
type "/pokemon team"
bash "$POKEMON" team
sleep 3

# ── 4. Stats ─────────────────────────────────────────────────────────────────
type "/pokemon stats"
bash "$POKEMON" stats
sleep 3

# ── 5. Badges ────────────────────────────────────────────────────────────────
type "/pokemon badges"
bash "$POKEMON" badges
sleep 3

# ── 6. Pokédex (un extrait, pas la liste de 151) ─────────────────────────────
type "/pokemon pokedex"
bash "$POKEMON" pokedex 2>/dev/null | head -30
echo "  ..."
sleep 3

# ── End ──────────────────────────────────────────────────────────────────────
type "# https://npmjs.com/package/claude-pokemon"
sleep 2
