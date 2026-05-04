# Contributing to claude-pokemon

Merci pour ton intérêt ! Voici comment contribuer.

## Setup local

```bash
git clone https://github.com/Benoit1108/claude-pokemon.git
cd claude-pokemon
bash bin/install.sh
```

Le script vérifie les prérequis (`jq`, `chafa`, `flock`, `curl`, optionnellement Python+Pillow), crée `~/.claude/pokemon/`, télécharge les sprites, et patch `settings.json`.

## Architecture

- **`lib/lib.sh`** : bibliothèque shell partagée (état, ticks, badges, mécaniques)
- **`lib/statusline.sh`** : rendu statusline (appelé par Claude Code à chaque tick)
- **`lib/pokemon-status.sh`** : sous-commandes `/pokemon` (vue détaillée + actions)
- **`lib/data.default.json`** : ⚠️ **fichier généré** — ne pas éditer directement. Source = `lib/data/**`.
- **`lib/data/`** : sources de la config par défaut, splittées par domaine (config, lineages par gen, wild_pool par gen, items, berries, etc.)
- **`lib/build-data.sh`** : concatène `lib/data/**` → `lib/data.default.json` (déterministe, clés triées)
- **`lib/locales/{fr,en}.json`** : strings UI localisés
- **`bin/`** : scripts d'install/update/etc. (orchestrés par `bin/claude-pokemon` Node)

L'**état utilisateur** est dans `~/.claude/pokemon/state.json`. Il survit aux updates (les data + scripts sont remplacés, mais l'état est préservé).

### Workflow data : ajouter du contenu

```bash
# 1. Édite la source qui te concerne :
#    lib/data/lineages/gen3.json    → nouveau starter Hoenn
#    lib/data/wild_pool/gen2.json   → wilds Johto
#    lib/data/items.json            → nouvel item
#    lib/data/config.json           → tweak shiny_chance, hatch_cost, etc.
nvim lib/data/lineages/gen3.json

# 2. Re-build le fichier déployé
npm run build:data            # ou : bash lib/build-data.sh

# 3. Commit les DEUX (sources + data.default.json généré)
git add lib/data/ lib/data.default.json
git commit -m "feat: add Gen 3 starters"
```

CI vérifie que `lib/data.default.json` est synchro avec `lib/data/**` (échec si tu oublies de re-builder).

## Types de contribution

### 🐛 Bug fixes

- Reproduis le bug, ouvre une issue avec les étapes
- PR avec fix + référence à l'issue

### 🌍 Traductions

Pour ajouter une langue (ex : espagnol) :

1. Copie `lib/locales/fr.json` vers `lib/locales/es.json`
2. Traduis tous les strings (en gardant les `%s` / `%d` aux mêmes positions)
3. Test : `jq '.language = "es"' ~/.claude/pokemon/data.json | sponge ~/.claude/pokemon/data.json`
4. Vérifie que toutes les vues (`/pokemon`, `team`, `stats`, `badges`...) rendent bien

### 🎮 Nouvelles mécaniques

Avant de coder, ouvre une issue pour discuter. Quelques règles :
- **Idempotent** : les ticks tournent souvent, les opérations doivent l'être
- **Non-bloquant** : pas d'opération > 100ms par tick (la statusline se rendra lentement)
- **Backward-compat** : ajout de champs JSON en `// {}` defaults (jamais retirer un champ)

### 🎨 Visuels

- Couleurs ANSI : palette dans `lib/lib.sh` `pokemon_ansi_color()` et `pokemon_type_color()`
- Thèmes : `pokemon_theme_accent()` lit `data.json.theme` (`default`/`dark`/`light`/`retro`). Le mode `retro` collapse aussi la palette stage+type vers du vert GameBoy monochrome — les autres thèmes ne changent que l'accent UI (titres, gauges ≥75%, badges earned-at, étoiles shiny).
- Sprites : sourcing depuis Pokémon Showdown (gen5 = pixel art classique)
- Animations : pipeline Python+PIL dans `lib/extract_animations.py`

Pour ajouter un thème :
1. Étends `pokemon_theme_accent()` avec un nouveau case (couleur 8-bit ANSI)
2. Si tu veux un override des type/stage colors (genre tint monochrome), branche dans `pokemon_ansi_color()` et `pokemon_type_color()` avant le case canonique
3. Documente dans `CLAUDE.md`

## Tests

CI GitHub Actions valide :
- Syntaxe bash (shellcheck) — incluant `lib/build-data.sh`
- JSON valides (`data.default.json`, sources `lib/data/**`, locales) + parité FR/EN
- `lib/data.default.json` synchro avec `lib/data/**` (rebuild = aucun diff)
- `npm pack` round-trip

Tests manuels :
```bash
bash bin/install.sh
bash bin/status.sh           # diagnostic
bash ~/.claude/pokemon-status.sh         # vue principale
bash ~/.claude/pokemon-status.sh team    # équipe
# ... toutes les sous-commandes
bash bin/uninstall.sh --confirm   # cleanup
```

## Convention de commit

Format : `<type>: <description courte>` (style [Conventional Commits](https://www.conventionalcommits.org/)).

Types courants :
- `feat:` nouvelle fonctionnalité user-facing
- `fix:` bug fix
- `chore:` maintenance (deps, config)
- `docs:` doc seulement
- `refactor:` réorganisation sans changement comportemental
- `perf:` optimisation
- `i18n:` traductions
- `ci:` GitHub Actions

Body : pourquoi (pas le quoi — le code dit le quoi).

## Code of Conduct

Sois respectueux. Critiques sur le code, pas sur les personnes. Diversity welcome.

## Licence

En contribuant, tu acceptes que ton code soit publié sous MIT (cf. [LICENSE](./LICENSE)).
