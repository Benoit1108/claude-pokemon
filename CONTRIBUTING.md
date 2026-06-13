# Contributing to claude-pokemon

Merci pour ton intérêt ! Voici comment contribuer.

## Prérequis

- **Node** ≥ 18 (runtime minimal). En dev, **Node 22 recommandé** : c'est la version la plus haute exigée par la CI (le job `web` en a besoin pour le toolchain ESLint de Nuxt, qui utilise `Object.groupBy`, dispo en Node 21+). `.nvmrc` est à `22` pour qu'un `nvm use` satisfasse tous les jobs.
- **npm** (le repo est un monorepo npm workspaces — pas de pnpm).

Plus de `jq`, `chafa`, `flock` ni bash : le runtime est 100 % Node-native.

## Setup local

```bash
git clone https://github.com/Benoit1108/claude-pokemon.git
cd claude-pokemon
npm ci
```

`npm ci` installe les workspaces (`api/`, `shared/`, `web/` + la CLI à la racine) et déclenche le hook `prepare` du package `shared` (`tsc`) qui build `shared/dist/` automatiquement. `shared/dist/` est gitignoré — il est toujours reconstruit, jamais committé.

## Lancer la CLI en local

```bash
# Rendre une vue directement (sans installer dans ~/.claude) :
node lib/pokemon.mjs            # vue principale
node lib/pokemon.mjs team       # équipe
node lib/pokemon.mjs stats      # ... toutes les sous-commandes

# Flow d'install complet (copie le runtime dans ~/.claude/pokemon/, patch settings.json) :
npx claude-pokemon install
npx claude-pokemon status       # diagnostic
npx claude-pokemon uninstall --confirm
```

## Architecture

Le moteur de jeu — **source de vérité** — est en TypeScript pur dans `shared/src/` :

- **`shared/src/`** : règles IO-free — `tick.ts`, `battle.ts`, `moves.ts`, `xp.ts`, `species.ts`, `stages.ts`, etc.
- **`shared/src/render/`** : rendu (ANSI sprites, vues, printf, i18n).
- **`shared/src/{pokemon-entry,statusline-entry}.ts`** : les deux entrypoints exécutables.
- **`lib/pokemon.mjs`** + **`lib/statusline.mjs`** : ⚠️ **artefacts committés** — bundles esbuild générés depuis les entrypoints `shared/`. **Ne jamais les éditer à la main.** Régénérés par `npm run build:data` (qui enchaîne `build:gen` + `build:engine`). La CI vérifie l'absence de drift.
- **`lib/data.default.json`** : ⚠️ **fichier généré** — ne pas éditer directement. Source = `lib/data/**`.
- **`lib/data/`** : sources de la config par défaut, splittées par domaine (config, lineages par gen, wild_pool par gen, items, berries, etc.).
- **`lib/sprites/`** + **`lib/sprites-mini/`** : sprites ANSI **pré-rendus et committés** (plus de téléchargement à l'install).
- **`lib/locales/{fr,en}.json`** : strings UI localisés.
- **`bin/*.mjs`** : installeurs/commandes Node (`install`, `update`, `uninstall`, `status`, `export`, `import`), orchestrés par `bin/claude-pokemon` (dispatcher Node).

L'**état utilisateur** est dans `~/.claude/pokemon/state.json`. Il survit aux updates (le runtime + data sont remplacés, mais l'état est préservé).

### Scripts mainteneur uniquement

- **`scripts/build-data.sh`** : concatène `lib/data/**` → `lib/data.default.json` (déterministe, clés triées).
- **`scripts/build-sprites.sh`** : régénère les sprites ANSI pré-rendus.
- **`scripts/ci-pre-push.sh`** : miroir local de la CI (lancé par le hook pre-push via `npm run ci:pre-push`).

### Workflow data : ajouter du contenu

```bash
# 1. Édite la source qui te concerne :
#    lib/data/lineages/gen3.json    → nouveau starter Hoenn
#    lib/data/wild_pool/gen2.json   → wilds Johto
#    lib/data/items.json            → nouvel item
#    lib/data/config.json           → tweak shiny_chance, hatch_cost, etc.
nvim lib/data/lineages/gen3.json

# 2. Re-build les artefacts générés (data + bundles)
npm run build:data

# 3. Commit les sources ET les artefacts régénérés
git add lib/data/ lib/data.default.json lib/pokemon.mjs lib/statusline.mjs shared/src/*.generated.ts
git commit -m "feat(cli): add Gen 3 starters"
```

La CI échoue si `lib/data.default.json`, les `*.generated.ts` ou les bundles `lib/*.mjs` ne sont pas synchro (drift = tu as oublié de re-builder).

## Types de contribution

### 🐛 Bug fixes

- Reproduis le bug, ouvre une issue avec les étapes.
- PR avec fix + référence à l'issue.

### 🌍 Traductions

Pour ajouter une langue (ex : espagnol) :

1. Copie `lib/locales/fr.json` vers `lib/locales/es.json`.
2. Traduis tous les strings (en gardant les `%s` / `%d` aux mêmes positions).
3. Vérifie que toutes les vues (`node lib/pokemon.mjs`, `team`, `stats`, `badges`...) rendent bien.

### 🎮 Nouvelles mécaniques

Avant de coder, ouvre une issue pour discuter. Les règles vivent dans `shared/src/` (TS pur). Quelques contraintes :

- **Pur** : pas d'IO ni d'horloge/RNG ambiants dans `shared/` — état en entrée → `{ state, events }` en sortie (réplicabilité, tests déterministes).
- **Idempotent** : les ticks tournent souvent, les opérations doivent l'être.
- **Non-bloquant** : pas d'opération > 100 ms par tick (sinon la statusline se rend lentement).
- **Backward-compat** : ajout de champs JSON avec defaults (jamais retirer un champ).

### 🎨 Visuels

- Couleurs ANSI : dans `shared/src/render/ansi.ts`.
- Sprites : sourcés depuis Pokémon Showdown (gen5 = pixel art classique), pré-rendus en ANSI via `scripts/build-sprites.sh`.

## Tests

```bash
npm run -w shared test    # moteur TS (vitest)
npm run -w api test       # Worker (vitest)
npm run -w web test       # Arène web (vitest)
npm test                  # smoke CLI (bats, tests/cli/)
```

La CI GitHub Actions valide aussi : JSON valides (data + locales) + parité FR/EN, absence de drift (`data.default.json`, `*.generated.ts`, bundles `lib/*.mjs`), lint/prettier/typecheck, et `npm pack` round-trip.

Le hook pre-push (`.claude/hooks/pre-push.sh`) lance `npm run ci:pre-push` avant chaque `git push`.

## Convention de commit

Format : `<type>(<scope>): <description courte>` (style [Conventional Commits](https://www.conventionalcommits.org/)).

Scopes courants : `cli`, `shared`, `api`, `web`.

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

Chaque PR ajoute une entrée dans `[Unreleased]` de `CHANGELOG.md` (sections `Added` / `Changed` / `Fixed` / `Removed` / `Security`) — pendant que le contexte est frais, pas au moment du release.

## Code of Conduct

Sois respectueux. Critiques sur le code, pas sur les personnes. Diversity welcome.

## Licence

En contribuant, tu acceptes que ton code soit publié sous MIT (cf. [LICENSE](./LICENSE)).
