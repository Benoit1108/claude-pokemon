// Sprint 3 — battle engine moved to claude-pokemon-shared (consumed via the
// git submodule under vendor/claude-pokemon/shared). This file is now a
// thin re-export so existing imports (`from '~/utils/battle-engine'`) keep
// working without churning every caller.
//
// New code should prefer importing directly from 'claude-pokemon-shared'
// or its sub-paths : claude-pokemon-shared/battle, /stages, /moves, /types.

export {
  ARENA_MAX_TURNS,
  LINEAGE_TO_TYPE,
  lineageToCombatType,
  TYPE_CHART,
  attackPower,
  deriveHpFromTurns,
  hashSeed,
  maxHp,
  mulberry32,
  resolveBattle,
  type BattleParticipant,
  type BattleResult,
  type BattleSide,
  type BattleTurn,
  type CombatType,
  type Lineage,
} from 'claude-pokemon-shared'
