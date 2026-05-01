#!/usr/bin/env bash
# claude-pokemon export <file> — backup state.json
set -euo pipefail
out="${1:-pokemon-backup-$(date +%Y%m%d-%H%M%S).json}"
cp "$HOME/.claude/pokemon/state.json" "$out"
echo "✓ État sauvegardé dans : $out"
