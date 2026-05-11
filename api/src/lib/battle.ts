// Sprint 3 A4 — battle engine moved to claude-pokemon-shared.
// This file is now a thin re-export so existing imports
// (`from '../../lib/battle'`) keep working without churning every handler.
// New code can import directly from 'claude-pokemon-shared/battle'.

export {
  TYPE_CHART,
  attackPower,
  deriveHpFromTurns,
  hashSeed,
  maxHp,
  mulberry32,
  resolveBattle,
} from 'claude-pokemon-shared/battle'
