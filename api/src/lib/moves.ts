// Sprint 3 A4 — moves catalog moved to claude-pokemon-shared. Thin re-export
// so existing imports keep working ; new code can import directly from
// 'claude-pokemon-shared/moves' or 'claude-pokemon-shared/stages'.

export {
  MOVES,
  STAGE_MOVES,
  movesForParticipant,
  movesForStage,
  type Move,
} from 'claude-pokemon-shared/moves'

export { stageFor, type LineageStage } from 'claude-pokemon-shared/stages'
