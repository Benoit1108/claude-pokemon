// Step-by-step battle engine for manual mode (player picks one of 4 moves
// per turn, bot AI responds). Separate from battle-engine.ts which stays
// the canonical async-PvP resolver — the manual mode introduces a moves
// model that the async resolver doesn't carry, so they're intentionally
// distinct.
//
// Determinism : given (challenger snapshot, defender snapshot, seed,
// list of actions), this engine always produces the same turn log. Useful
// for replay and unit testing.
//
// Public API :
//   initManualBattle(args)              → ManualBattleState (Lv.1 of resolution)
//   playerMoves(state)                  → Move[]   (4 moves available to the side whose turn it is)
//   applyManualAction(state, moveIndex) → ManualBattleState (after one tick of action)
//   chooseAiMove(state, difficulty)     → moveIndex picked by the bot AI
//   stateToResult(state)                → BattleResult (drop-in for BattleStage/Log/etc.)

import {
  ARENA_MAX_TURNS,
  attackPower,
  hashSeed,
  lineageToCombatType,
  maxHp,
  mulberry32,
  TYPE_CHART,
  type CombatType,
} from '~/utils/battle-engine'
import { movesForParticipant, type Move } from '~/data/moves'
import type { BattleParticipant, BattleResult, BattleSide, BattleTurn } from '~/types/api'

export interface ManualCombatant {
  side: BattleSide
  participant: BattleParticipant
  hp: number
  maxHp: number
  attack: number
  type: CombatType
  moves: Move[]
}

export interface ManualBattleState {
  challenger: ManualCombatant
  defender: ManualCombatant
  turns: BattleTurn[]
  rng: () => number
  seed: number
  finished: boolean
  winner: BattleSide | 'draw' | null
  reason: 'ko' | 'turn_limit' | null
  /** Whose turn is it to PICK a move (state machine). */
  whoseTurn: BattleSide
  createdAt: string
}

export type AiDifficulty = 'easy' | 'normal' | 'hard'

function buildCombatant(side: BattleSide, p: BattleParticipant): ManualCombatant {
  return {
    side,
    participant: p,
    hp: maxHp(p.level, p.is_shiny),
    maxHp: maxHp(p.level, p.is_shiny),
    attack: attackPower(p.level, p.is_shiny),
    type: lineageToCombatType(p.lineage),
    moves: movesForParticipant(p.lineage, p.level),
  }
}

/**
 * Build the initial state. Whose turn first = same rule as auto resolver
 * (higher level goes first; tie broken by seeded coin flip).
 */
export function initManualBattle(args: {
  challenger: BattleParticipant
  defender: BattleParticipant
  seed: number
  createdAt?: string
}): ManualBattleState {
  const rng = mulberry32(args.seed)
  const c = buildCombatant('challenger', args.challenger)
  const d = buildCombatant('defender', args.defender)
  let whoseTurn: BattleSide
  if (c.participant.level > d.participant.level) whoseTurn = 'challenger'
  else if (d.participant.level > c.participant.level) whoseTurn = 'defender'
  else whoseTurn = rng() < 0.5 ? 'challenger' : 'defender'

  return {
    challenger: c,
    defender: d,
    turns: [],
    rng,
    seed: args.seed,
    finished: false,
    winner: null,
    reason: null,
    whoseTurn,
    createdAt: args.createdAt ?? new Date().toISOString(),
  }
}

/** Moves available to whoever's turn it is. */
export function playerMoves(state: ManualBattleState): Move[] {
  return state.whoseTurn === 'challenger' ? state.challenger.moves : state.defender.moves
}

/**
 * Damage formula : base attack × move power × type effectiveness × variance × crit.
 * Stays close to the auto-resolver formula but injects the move's power
 * coefficient so move choice matters.
 */
function rollDamage(
  attacker: ManualCombatant,
  defender: ManualCombatant,
  move: Move,
  rng: () => number,
): { damage: number; effectiveness: number; critical: boolean } {
  const effectiveness = TYPE_CHART[move.type][defender.type]
  const variance = 0.85 + rng() * 0.3
  const critRoll = rng()
  const critical = critRoll < 0.0625
  const critMult = critical ? 1.5 : 1
  const raw = (attacker.attack * move.power * effectiveness * variance * critMult) / 4
  return { damage: Math.max(1, Math.round(raw)), effectiveness, critical }
}

/**
 * Apply one action (the side whose turn it is uses move at moveIndex).
 * Returns a NEW state — does not mutate. Caller is responsible for stopping
 * once `state.finished` is true (further calls become no-ops).
 */
export function applyManualAction(state: ManualBattleState, moveIndex: number): ManualBattleState {
  if (state.finished) return state
  if (state.turns.length >= ARENA_MAX_TURNS) {
    return finalizeTurnLimit(state)
  }

  const attacker = state.whoseTurn === 'challenger' ? state.challenger : state.defender
  const defender = state.whoseTurn === 'challenger' ? state.defender : state.challenger
  const move = attacker.moves[Math.max(0, Math.min(moveIndex, attacker.moves.length - 1))]!

  const { damage, effectiveness, critical } = rollDamage(attacker, defender, move, state.rng)

  // Mutate clones (engine is functional from caller's POV — we copy on write).
  const newDefender: ManualCombatant = {
    ...defender,
    hp: Math.max(0, defender.hp - damage),
  }
  const turn: BattleTurn = {
    turn: state.turns.length + 1,
    actor: state.whoseTurn,
    damage,
    effectiveness,
    critical,
    defender_hp_after: newDefender.hp,
  }

  const challenger = state.whoseTurn === 'challenger' ? state.challenger : newDefender
  const defenderC = state.whoseTurn === 'challenger' ? newDefender : state.defender

  const next: ManualBattleState = {
    ...state,
    challenger,
    defender: defenderC,
    turns: [...state.turns, turn],
    whoseTurn: state.whoseTurn === 'challenger' ? 'defender' : 'challenger',
  }

  if (newDefender.hp <= 0) {
    next.finished = true
    next.winner = state.whoseTurn
    next.reason = 'ko'
  } else if (next.turns.length >= ARENA_MAX_TURNS) {
    return finalizeTurnLimit(next)
  }
  return next
}

function finalizeTurnLimit(state: ManualBattleState): ManualBattleState {
  const cPct = state.challenger.hp / state.challenger.maxHp
  const dPct = state.defender.hp / state.defender.maxHp
  let winner: BattleSide | 'draw'
  if (cPct > dPct) winner = 'challenger'
  else if (dPct > cPct) winner = 'defender'
  else winner = 'draw'
  return { ...state, finished: true, winner, reason: 'turn_limit' }
}

/**
 * Bot AI : picks a move index for the side whose turn it is.
 *
 * easy   — uniform random
 * normal — best expected damage (effectiveness × power), random tie-break
 * hard   — best expected damage, with bias toward finishing if defender is low HP
 *          and toward crit-prone moves (high power) when attacker is low HP
 */
export function chooseAiMove(
  state: ManualBattleState,
  difficulty: AiDifficulty = 'normal',
): number {
  if (state.finished) return 0
  const me = state.whoseTurn === 'challenger' ? state.challenger : state.defender
  const opp = state.whoseTurn === 'challenger' ? state.defender : state.challenger

  if (difficulty === 'easy') {
    return Math.floor(state.rng() * me.moves.length)
  }

  // Score each move by expected damage (no crit / no variance for evaluation).
  const scores = me.moves.map(m => {
    const eff = TYPE_CHART[m.type][opp.type]
    let score = m.power * eff
    if (difficulty === 'hard') {
      // Finisher bias : if opponent's HP is below 25%, prefer the highest
      // raw damage (+10%). Otherwise spread.
      if (opp.hp < opp.maxHp * 0.25) score *= 1 + m.power * 0.1
      // Defensive bias : if I'm low, take the highest expected damage even harder.
      if (me.hp < me.maxHp * 0.3) score *= 1.1
    }
    return score
  })
  // Find the max. Random tie-break uses rng so determinism is preserved.
  let bestScore = -Infinity
  const bestIdx: number[] = []
  for (let i = 0; i < scores.length; i++) {
    if (scores[i]! > bestScore) {
      bestScore = scores[i]!
      bestIdx.length = 0
      bestIdx.push(i)
    } else if (scores[i] === bestScore) {
      bestIdx.push(i)
    }
  }
  return bestIdx[Math.floor(state.rng() * bestIdx.length)]!
}

/**
 * Convert internal state to a BattleResult drop-in for existing components
 * (BattleStage, BattleLog, BattleResultBanner already consume BattleResult).
 */
export function stateToResult(state: ManualBattleState): BattleResult {
  return {
    battle_id: null,
    challenger: state.challenger.participant,
    defender: state.defender.participant,
    seed: state.seed,
    turns: state.turns,
    winner: state.winner ?? 'draw',
    reason: state.reason ?? 'turn_limit',
    created_at: state.createdAt,
  }
}

/** Convenience : derive a stable seed from (challenger anon_id, defender anon_id, salt). */
export function deriveManualSeed(
  challengerId: string,
  defenderId: string,
  salt: string | number = '',
): number {
  return hashSeed(`${challengerId}|${defenderId}|${salt}`)
}
