# claude-pokemon-shared

> **Internal** shared battle engine + types + moves catalog for the
> [claude-pokemon](https://github.com/Benoit1108/claude-pokemon) ecosystem.

This package is **not published to npm**. It's the single source of truth
for the battle logic shared between :

- the **Worker API** in `../api/` (consumed via [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces))
- the **arena web** in [`claude-pokemon-arena`](https://github.com/Benoit1108/claude-pokemon-arena) (consumed via a git submodule + `file:` dependency)

Before this package existed, both sides hand-maintained mirrors that drifted
silently. A contractual parity test was the only guard against replay-
breaking drift. With the shared package, there's just one canonical
implementation.

## Build & test

```bash
npm install          # at the claude-pokemon repo root (sets up workspaces)
cd shared
npm run build        # regenerate dist/
npm test             # 25 tests pinning every invariant
```

The `dist/` directory **is committed to git** so consumers don't need to
run a build step at install time. Whenever you edit `src/`, **run
`npm run build` and commit the regenerated `dist/`** in the same commit.

## What's in it

| Module | Exports |
|--------|---------|
| `claude-pokemon-shared` (root) | Everything below (convenience re-export) |
| `claude-pokemon-shared/types` | `Lineage`, `BattleParticipant`, `BattleTurn`, `BattleResult`, `BattleSide`, `CombatType`, `ALLOWED_LINEAGES`, `LINEAGE_TO_TYPE`, `ARENA_MAX_TURNS` |
| `claude-pokemon-shared/battle` | `resolveBattle`, `deriveHpFromTurns`, `maxHp`, `attackPower`, `TYPE_CHART`, `mulberry32`, `hashSeed` |
| `claude-pokemon-shared/stages` | `LINEAGE_STAGES`, `stageFor`, `type LineageStage` |
| `claude-pokemon-shared/moves` | `MOVES`, `STAGE_MOVES`, `movesForStage`, `movesForParticipant`, `type Move` |

## Determinism

`resolveBattle` is pure : given the same `(challenger, defender, seed)`, it
always produces the same turn log. This is the foundation of the replay
feature in the arena web.

## How the arena web consumes this

```bash
# In claude-pokemon-arena/
git submodule add https://github.com/Benoit1108/claude-pokemon.git vendor/claude-pokemon
```

And in `claude-pokemon-arena/package.json`:

```json
"dependencies": {
  "claude-pokemon-shared": "file:./vendor/claude-pokemon/shared"
}
```

Then `npm install`. Cloudflare Pages needs the **Include submodules**
build setting enabled.

To bump the version of shared used by arena :

```bash
cd claude-pokemon-arena/vendor/claude-pokemon && git pull origin main
cd ../.. && git add vendor/claude-pokemon && git commit -m "chore: bump shared to <SHA>"
git push
```

## License

MIT
