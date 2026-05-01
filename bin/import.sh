#!/usr/bin/env bash
# claude-pokemon import <file> — restore state.json
set -euo pipefail
src="${1:-}"
[ -z "$src" ] && { echo "Usage: npx claude-pokemon import <file>"; exit 1; }
[ ! -f "$src" ] && { echo "Fichier introuvable : $src"; exit 1; }
jq . "$src" >/dev/null || { echo "JSON invalide : $src"; exit 1; }
backup="$HOME/.claude/pokemon/state.json.bak-$(date +%Y%m%d-%H%M%S)"
cp "$HOME/.claude/pokemon/state.json" "$backup"
cp "$src" "$HOME/.claude/pokemon/state.json"
echo "✓ État restauré depuis : $src"
echo "  (ancien état → $backup)"
