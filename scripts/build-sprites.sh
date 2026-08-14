#!/usr/bin/env bash
# Pre-render the Pokémon Showdown sprites into committed ANSI .txt files
# (Phase R3d-5). This moves chafa + curl from the *user's* install to
# *package-build* time: the .txt are shipped in the npm tarball and the
# installer just copies them — so the runtime CLI needs neither chafa nor
# network, a prerequisite for dropping bash → Windows-native.
#
# Maintainer-only. Run after the lineage sprite set changes:
#   bash scripts/build-sprites.sh
# then commit lib/sprites/ + lib/sprites-mini/. CI checks the file count (168).
#
# Requires: chafa, curl, jq, python3 + Pillow.
#
# Les deux jeux ne sont PAS rendus pareil, et c'est voulu :
#
#   lib/sprites/       (vues /pokemon) → passe par scripts/prepare_sprite.py :
#                      crop bounding-box alpha + alpha-bleed, et nombre de lignes
#                      proportionnel à la taille de la créature (11→16).
#   lib/sprites-mini/  (statusline)    → canvas complet, 24x12, AUCUNE pré-passe.
#
# Recadrer ne crée pas d'information : ça permet seulement de choisir une échelle
# plus grande. À empreinte constante le rendu est identique — le gain est dépensé
# à agrandir, pas à affiner. Sur la grande vue c'est un gain net ; dans la
# statusline ça grossit les blocs sans gain de netteté perçu et coûte 2 lignes de
# terminal. Le mini garde donc le rendu d'origine. Ne pas « harmoniser » les deux
# branches sans relire l'en-tête de prepare_sprite.py.
#
# Le rendu de lib/sprites/ dépend des versions de chafa et de Pillow. Rien ne
# drift-checke le contenu aujourd'hui, mais un mainteneur sur d'autres versions
# produira un diff bruité. Dernier build : chafa 1.18.1, Pillow 12.1.1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA="$ROOT/lib/data.default.json"
PREPARE="$ROOT/scripts/prepare_sprite.py"

for tool in chafa curl jq python3; do
  command -v "$tool" >/dev/null 2>&1 || { echo "error: $tool is required" >&2; exit 1; }
done
python3 -c 'import PIL' 2>/dev/null || { echo "error: Pillow is required (pip install Pillow)" >&2; exit 1; }

ids=$(jq -r '.lineages | to_entries[] | .value.stages[].showdown_id' "$DATA" | sort -u)
count=0
for variant in normal shiny; do
  url_path="gen5"; [ "$variant" = "shiny" ] && url_path="gen5-shiny"
  mkdir -p "$ROOT/lib/sprites/$variant" "$ROOT/lib/sprites-mini/$variant"
  for id in $ids; do
    out_std="$ROOT/lib/sprites/$variant/$id.txt"
    out_mini="$ROOT/lib/sprites-mini/$variant/$id.txt"
    tmp=$(mktemp --suffix=.png)
    framed=$(mktemp --suffix=.png)
    if curl -sf -o "$tmp" "https://play.pokemonshowdown.com/sprites/$url_path/$id.png" 2>/dev/null; then
      if rows_std=$(python3 "$PREPARE" "$tmp" "$framed"); then
        # Grande vue : recadré + alpha-bleed, hauteur selon la taille réelle.
        chafa --size "32x$rows_std" --symbols block "$framed" > "$out_std" 2>/dev/null
        # Statusline : PNG brut, 24x12 fixe (cf. en-tête — ne pas recadrer ici).
        chafa --size 24x12 --symbols block "$tmp" > "$out_mini" 2>/dev/null
        count=$((count + 1))
      else
        echo "  warn: prepare_sprite.py failed on $url_path/$id.png" >&2
      fi
    else
      echo "  warn: could not fetch $url_path/$id.png" >&2
    fi
    rm -f "$tmp" "$framed"
  done
done
echo "Rendered $count sprites → lib/sprites/ + lib/sprites-mini/"
