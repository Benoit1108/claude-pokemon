// Sprint 3 — moves catalog moved to claude-pokemon-shared (consumed via the
// git submodule under vendor/claude-pokemon/shared). Thin re-export so
// existing imports (`from '~/data/moves'`) keep working.

export {
  MOVES,
  STAGE_MOVES,
  movesForParticipant,
  movesForStage,
  type Move,
} from 'claude-pokemon-shared/moves'
