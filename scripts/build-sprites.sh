#!/usr/bin/env bash
# Pre-render the Pokémon Showdown sprites into committed ANSI .txt files
# (Phase R3d-5). This moves chafa + curl from the *user's* install to
# *package-build* time: the .txt are shipped in the npm tarball and the
# installer just copies them — so the runtime CLI needs neither chafa nor
# network, a prerequisite for dropping bash → Windows-native.
#
# Maintainer-only. Run after the lineage sprite set changes:
#   bash scripts/build-sprites.sh
# then commit lib/sprites/ + lib/sprites-mini/. CI drift-checks the output.
#
# Requires: chafa, curl, jq. Sizes/flags MUST match bin/install.sh so the
# rendered art is identical to what installs produced before.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/lib/data.default.json"

for tool in chafa curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool is required" >&2; exit 1; }
done

ids=$(jq -r '.lineages | to_entries[] | .value.stages[].showdown_id' "$DATA" | sort -u)
count=0
for variant in normal shiny; do
  url_path="gen5"; [ "$variant" = "shiny" ] && url_path="gen5-shiny"
  mkdir -p "$ROOT/lib/sprites/$variant" "$ROOT/lib/sprites-mini/$variant"
  for id in $ids; do
    out_std="$ROOT/lib/sprites/$variant/$id.txt"
    out_mini="$ROOT/lib/sprites-mini/$variant/$id.txt"
    tmp=$(mktemp --suffix=.png)
    if curl -sf -o "$tmp" "https://play.pokemonshowdown.com/sprites/$url_path/$id.png" 2>/dev/null; then
      chafa --size 32x16 --symbols block "$tmp" > "$out_std" 2>/dev/null
      chafa --size 24x12 --symbols block "$tmp" > "$out_mini" 2>/dev/null
      count=$((count + 1))
    else
      echo "  warn: could not fetch $url_path/$id.png" >&2
    fi
    rm -f "$tmp"
  done
done
echo "Rendered $count sprites → lib/sprites/ + lib/sprites-mini/"
