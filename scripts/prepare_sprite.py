#!/usr/bin/env python3
"""Pré-passe de cadrage pour le jeu de sprites `lib/sprites/` (vues /pokemon).

Appelé par scripts/build-sprites.sh. Résout deux défauts du rendu direct du PNG
Showdown :

1. **Marge perdue.** Les sprites Showdown sont des canvas 96x96 dont la créature
   n'occupe qu'une fraction (médiane mesurée sur le roster : 35 % de la surface ;
   28x30 px pour l'œuf, soit 9 %). chafa mettant le canvas *entier* à l'échelle
   de la grille de cellules, cette marge consommait des cellules pour afficher
   du vide, puis trimSprite la jetait. On recadre donc sur la bounding-box alpha.

2. **Liseré noir.** Les pixels transparents portent un RGB (0,0,0). Au downscale,
   chafa moyenne ces zéros avec les pixels opaques voisins et fabrique un liseré
   sombre sur le contour. On étale (« alpha bleed ») la couleur des pixels
   opaques dans le transparent avant le downscale ; l'alpha reste à 0, donc la
   transparence est préservée, mais la moyenne ne tire plus vers le noir.

Le recadrage seul égaliserait la taille apparente de toutes les espèces (un
Pichu aussi gros qu'un Dracaufeu, l'évolution ne se verrait plus). Le nombre de
*lignes* cible reste donc fonction de la taille réelle de la créature dans son
canvas : la hiérarchie de taille survit, et le gain se concentre sur les petits
sprites qui étaient les plus sous-résolus.

**Pourquoi seulement `lib/sprites/`.** Recadrer ne crée pas d'information : ça
permet seulement de choisir une échelle plus grande. À empreinte d'affichage
constante, le rendu est rigoureusement identique — le gain de définition est
*dépensé* à agrandir le sprite, pas à l'affiner. Sur la grande vue /pokemon
l'agrandissement est un gain net. Dans la statusline en revanche, il rend les
blocs visiblement plus gros sans que l'œil y gagne en netteté (on rééchantillonne
un source 65x55 vers ~24x20 échantillons dans les deux cas), et il coûte 2 lignes
de terminal. `lib/sprites-mini/` garde donc volontairement le rendu d'origine :
canvas complet, 24x12, sans pré-passe.

Usage :
    prepare_sprite.py <src.png> <dst.png>
    → stdout : "<lignes_std>"

Requiert Pillow (mainteneur uniquement — cf. scripts/extract_animations.py).
"""

import sys

from PIL import Image

# Fraction du canvas en-dessous de laquelle une créature est traitée comme étant
# à la taille plancher. Seuil ABSOLU (et non dérivé du roster) pour que l'ajout
# d'une lignée ne redistribue pas les tailles de tous les sprites existants.
SIZE_FLOOR = 0.30

# Nombre de lignes de cellules alloué, du plancher au plafond de taille. La
# largeur reste 32 (cf. build-sprites.sh) : chafa préserve le ratio, donc un
# sprite large sature la largeur avant d'atteindre le max de lignes.
ROWS_STD = (11, 16)

BLEED_PASSES = 6


def alpha_bleed(im, passes=BLEED_PASSES):
    """Étale la couleur des pixels opaques dans les zones transparentes.

    L'alpha des pixels étalés reste à 0 : seul leur RGB change, pour que le
    rééchantillonnage de chafa ne moyenne plus du noir sur les bords.
    """
    px = im.load()
    w, h = im.size
    neighbours = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1))
    for _ in range(passes):
        updates = {}
        for y in range(h):
            for x in range(w):
                if px[x, y][3] != 0:
                    continue
                r = g = b = n = 0
                for dx, dy in neighbours:
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] > 0:
                        pr, pg, pb, _ = px[nx, ny]
                        r += pr
                        g += pg
                        b += pb
                        n += 1
                if n:
                    updates[(x, y)] = (r // n, g // n, b // n, 0)
        if not updates:
            break
        for pos, rgba in updates.items():
            px[pos] = rgba
    return im


def rows_for(size_score, bounds):
    lo, hi = bounds
    return int(round(lo + (hi - lo) * size_score))


def main():
    if len(sys.argv) != 3:
        print(f"usage: {sys.argv[0]} <src.png> <dst.png>", file=sys.stderr)
        return 2
    src, dst = sys.argv[1], sys.argv[2]
    im = Image.open(src).convert("RGBA")
    bbox = im.getbbox()
    if bbox is None:
        # Sprite entièrement transparent : rien à recadrer, on garde le plafond.
        im.save(dst)
        print(ROWS_STD[1])
        return 0

    crop = im.crop(bbox)
    canvas = max(im.width, im.height)
    occupancy = max(crop.width, crop.height) / canvas
    score = min(1.0, max(0.0, (occupancy - SIZE_FLOOR) / (1.0 - SIZE_FLOOR)))

    alpha_bleed(crop).save(dst)
    print(rows_for(score, ROWS_STD))
    return 0


if __name__ == "__main__":
    sys.exit(main())
