// Species → CombatType resolution. Phase 2.14 — the engine now uses the full
// 18 canonical types (a Dragon stays a Dragon), and the map is generated from
// the CLI wild_pool (single source of truth) in claude-pokemon-shared. This is
// a thin re-export so existing imports (`from '../../data/species-types'`)
// keep working ; new code can import from 'claude-pokemon-shared/species'.

export { speciesToCombatType, SPECIES_COMBAT_TYPE } from 'claude-pokemon-shared'
