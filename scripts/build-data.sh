#!/usr/bin/env bash
# Concatenates lib/data/** into lib/data.default.json (deterministic, sorted keys).
# Run after editing any lib/data/** source file. CI verifies no drift.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

OUT="lib/data.default.json"
SRC_DIR="lib/data"

[ -d "$SRC_DIR" ] || { echo "Missing $SRC_DIR"; exit 1; }
command -v jq >/dev/null || { echo "jq required"; exit 1; }

# Object sources: merged with recursive `*` (handles cross-gen lineages cleanly)
mapfile -t obj_files < <(printf '%s\n' \
  "$SRC_DIR/config.json" \
  "$SRC_DIR/thresholds.json" \
  "$SRC_DIR/seasons.json" \
  "$SRC_DIR/items.json" \
  "$SRC_DIR/berries.json" \
  "$SRC_DIR"/special/*.json \
  "$SRC_DIR"/lineages/*.json)

merged=$(jq -s 'reduce .[] as $x ({}; . * $x)' "${obj_files[@]}")

# Wild pool: concat arrays from each gen file (each file = {wild_pool: [...]})
wild_pool=$(jq -s 'map(.wild_pool) | add' "$SRC_DIR"/wild_pool/*.json)

# Auto-inject version from package.json (single source of truth — no manual sync)
pkg_version=$(jq -r '.version' package.json)

# Inject wild_pool + version, output with -S for byte-stable diff
printf '%s\n' "$merged" \
  | jq --argjson wp "$wild_pool" --arg v "$pkg_version" -S '.wild_pool = $wp | .version = $v' \
  > "$OUT.tmp"
mv "$OUT.tmp" "$OUT"

echo "✓ Built $OUT ($(wc -l < "$OUT") lignes, $(wc -c < "$OUT") octets)"
