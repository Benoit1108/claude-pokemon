# CLAUDE.md

Instructions pour Claude Code lors du développement de **claude-pokemon**.

## Vue d'ensemble

Compagnon Pokémon persistant pour la `statusLine` de Claude Code, distribué via npm (`claude-pokemon`).

- **npm** : https://www.npmjs.com/package/claude-pokemon
- **GitHub** : https://github.com/Benoit1108/claude-pokemon
- **Install end-user** : `npx claude-pokemon install`

## Architecture

```
claude-pokemon/
├── bin/
│   ├── claude-pokemon         Node CLI dispatcher (entry npx)
│   ├── install.sh             Bootstrap ~/.claude/pokemon/, sprites, settings.json
│   ├── update.sh, uninstall.sh, status.sh, export.sh, import.sh
├── lib/
│   ├── lib.sh                 Tick logic, badges, archives, helpers (43 KB)
│   ├── statusline.sh          Rendu statusline (1 sortie par tick)
│   ├── pokemon-status.sh      Sous-commandes /pokemon (45 KB)
│   ├── data.default.json      ⚠️ GÉNÉRÉ — ne pas éditer (source = lib/data/**)
│   ├── data/                  Sources splittées par domaine
│   │   ├── config.json        Toggles, taux, scales, event_chances
│   │   ├── thresholds.json    XP par level (array 100 entries)
│   │   ├── seasons.json       Modificateurs saisonniers
│   │   ├── items.json, berries.json
│   │   ├── special/eevee.json Friendship + evolution_rules
│   │   ├── lineages/gen{N}.json    Lignées par génération
│   │   └── wild_pool/gen{N}.json   Wilds par génération
│   ├── build-data.sh          Concatène lib/data/** → lib/data.default.json (-S déterministe)
│   ├── locales/{fr,en}.json   UI strings i18n
│   └── extract_animations.py  Pipeline Python+PIL (canvas 96x96 centré)
├── skills/pokemon/SKILL.md    Slash command Claude Code
├── assets/demo.gif            GIF démo référencé dans le README
├── .demo/                     Scripts asciinema (regen reproductible du GIF)
└── .github/workflows/ci.yml   CI : shellcheck, JSON, build drift, install dry-run, npm pack
```

L'**état utilisateur** vit dans `~/.claude/pokemon/state.json` (préservé entre les `update.sh`).

## Conventions

- **Commits** : Conventional Commits (`feat:` / `fix:` / `chore:` / `ci:` / `docs:` / `refactor:` / `i18n:`)
- **Pas de Co-Authored-By** dans les commits
- **Pas de push** sur `main` sans validation explicite
- **Strings UI** : toujours via `pokemon_t <key>` (jamais hardcoded en français/anglais)
- **Data** : éditer **uniquement** `lib/data/**`, jamais `lib/data.default.json` directement. Re-build avec `npm run build:data` (ou `bash lib/build-data.sh`) avant commit. CI échoue si la source diverge du build.
- **JSON keys** : ASCII uniquement, accents seulement dans les values
- **Backward-compat schema** : ajout de champs en `// {}` defaults dans jq (jamais retirer un champ de `state.json`)
- **printf format** : si plusieurs `%s`, vérifier le nombre d'args (printf cycle si trop d'args → bug fréquent qui duplique les sorties)

## Tests locaux

```bash
bash bin/install.sh                            # Bootstrap dans ~/.claude/pokemon/
bash bin/status.sh                             # Diagnostic
bash ~/.claude/pokemon-status.sh               # Vue principale
bash ~/.claude/pokemon-status.sh team          # Équipe
bash ~/.claude/pokemon-status.sh stats         # Stats
# … toutes les sous-commandes
bash bin/uninstall.sh --confirm                # Cleanup
```

## Mécaniques d'évolution Eevee (Lv.30)

Décision dans `lib.sh:840` (block dans `pokemon_tick`). Ordre :
1. **Pierre tenue** : `fire_stone` → Pyroli, `water_stone` → Aquali, `thunder_stone` → Voltali. Pierre consommée.
2. **Friendship ≥ seuil** (`eevee_friendship_threshold`, default 50) :
   - jour (UTC 6-17) → Mentali (Espeon)
   - nuit (UTC 18-5) → Noctali (Umbreon)
3. **Friendship < seuil** : fallback aléatoire vers une forme élémentaire (Aquali/Voltali/Pyroli) — sans pierre consommée. Justification : le système force l'évolution à Lv.30 (contrairement à canon où Évoli reste Évoli jusqu'à friendship élevée), donc on ne peut pas bloquer l'évolution.

Friendship est lifetime (pas reset sur hatch). Pour la plupart des players, le seuil 50 est atteint bien avant Lv.30 → branche fallback rarement déclenchée.

## Thèmes

`data.json.theme` contrôle l'accent UI (titres, gauges ≥75%, badges, ★ shiny) :
- `default` — gold (256-color 220)
- `dark` — electric cyan (51)
- `light` — sépia (94, lisible sur fond clair)
- `retro` — GameBoy green (46), + palette stage/type collapsée monochrome

`pokemon_theme_accent()` retourne le code ANSI du thème actif. `pokemon_ansi_color()` et `pokemon_type_color()` branchent en mode `retro` pour produire l'effet GB.

## Pièges connus

- **Cursor positioning ANSI dans statusline** : Claude Code strippe le leading whitespace + ignore `\033[<col>G` sur lignes vides. Workaround : anchor char `\033[2;30m·\033[0m` en début de ligne pour forcer la préservation.
- **Animations** : désactivées par défaut, frames extraites via Python+PIL (canvas 96x96 centré). Opt-in via `enable_animations: true` dans `data.json`.
- **Sprite alignment 32x16** : utiliser `pokemon_trim_sprite` qui calcule le min_lead et le strip uniformément (préserve l'alignement relatif).
- **`%-22s` byte-padding** casse sur Unicode (accents = 2 bytes mais 1 char). Utiliser `pokemon_t_pad` (basé sur `LC_ALL=C.UTF-8 wc -m`).
- **`shellcheck SC1087`** : `jq ".$var..."` est interprété comme expansion d'array. Toujours utiliser `jq --arg f "$var" '.[$f]...'`.

## CI

`.github/workflows/ci.yml` valide à chaque push :
1. **Lint bash** (`shellcheck -S error`) sur tous les scripts publiés
2. **Validate JSON** (`jq empty`) + parité des clés FR/EN dans les locales
3. **Install dry-run** (`bash -n`, vérifie présence des fichiers requis)
4. **npm pack --dry-run**

## Workflow de publish npm

Voir `.demo/record.sh` pour la régénération du GIF démo.
Pour publier une nouvelle version, voir le workflow détaillé dans `CONTRIBUTING.md`.

## Documentation complémentaire

- [`README.md`](README.md) — features, install, prerequisites
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — setup local, types de contributions, conventions
- [`CHANGELOG.md`](CHANGELOG.md) — historique des versions
