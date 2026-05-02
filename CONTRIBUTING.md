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
- **`lib/data.default.json`** : config par défaut (lignées, seuils, items, locales)
- **`lib/locales/{fr,en}.json`** : strings UI localisés
- **`bin/`** : scripts d'install/update/etc. (orchestrés par `bin/claude-pokemon` Node)

L'**état utilisateur** est dans `~/.claude/pokemon/state.json`. Il survit aux updates (les data + scripts sont remplacés, mais l'état est préservé).

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
- Sprites : sourcing depuis Pokémon Showdown (gen5 = pixel art classique)
- Animations : pipeline Python+PIL dans `lib/extract_animations.py`

## Tests

CI GitHub Actions valide :
- Syntaxe bash (shellcheck)
- JSON valides + parité FR/EN
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
