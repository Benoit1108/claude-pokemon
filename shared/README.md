# claude-pokemon-shared

> Shared battle engine + types + moves catalog for the [claude-pokemon](https://github.com/Benoit1108/claude-pokemon) ecosystem.

This package eliminates the hand-maintained mirrors between :

- **CLI / Worker API** (`api/src/lib/battle.ts`, `api/src/lib/moves.ts`)
- **Arena web** (`app/utils/battle-engine.ts`, `app/data/moves.ts`)

Before this package existed, both sides had to be kept byte-equivalent
manually — a drift broke replay parity (different damage logs on the same
seed) or stage-pool validation (the web showed moves the worker rejected).
[Contractual parity tests](https://github.com/Benoit1108/claude-pokemon/blob/main/api/tests/lib/battle-parity.test.ts)
guarded this until extraction.

## Install

```bash
npm install claude-pokemon-shared
```

## Usage

```ts
import { resolveBattle, type BattleParticipant } from 'claude-pokemon-shared'

const challenger: BattleParticipant = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 50,
  is_shiny: false,
}
const defender: BattleParticipant = { /* ... */ }

const result = resolveBattle({
  challenger,
  defender,
  seed: 12345,
  createdAt: new Date().toISOString(),
})
// → { winner: 'challenger', reason: 'ko', turns: [...], ... }
```

## What's in it

- **Types** : `BattleParticipant`, `BattleTurn`, `BattleResult`, `BattleSide`, `CombatType`, `Lineage`
- **Battle engine** : `resolveBattle`, `deriveHpFromTurns`, `maxHp`, `attackPower`, `TYPE_CHART`, `LINEAGE_TO_TYPE`, `mulberry32`, `hashSeed`, `ARENA_MAX_TURNS`
- **Stages** : `LINEAGE_STAGES`, `stageFor`
- **Moves** : `MOVES`, `STAGE_MOVES`, `movesForStage`, `type Move`

## Sub-path imports

For tree-shaking-friendly imports :

```ts
import { resolveBattle } from 'claude-pokemon-shared/battle'
import { movesForStage } from 'claude-pokemon-shared/moves'
import { stageFor } from 'claude-pokemon-shared/stages'
import type { BattleParticipant } from 'claude-pokemon-shared/types'
```

## Determinism

`resolveBattle` is pure : given the same `(challenger, defender, seed)`, it
always produces the same turn log. This is the foundation of the replay
feature in the arena web.

## License

MIT
