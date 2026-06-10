import { describe, it, expect } from 'vitest'
import {
  applyManualAction,
  chooseAiMove,
  deriveManualSeed,
  initManualBattle,
  playerMoves,
  stateToResult,
} from '~/utils/manual-battle'
import type { BattleParticipant } from '~/types/api'

const challenger: BattleParticipant = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 30,
  is_shiny: false,
}
const defender: BattleParticipant = {
  anon_id: 'bbbbbbbb',
  display_name: 'Misty',
  lineage: 'grass',
  level: 30,
  is_shiny: false,
}

describe('initManualBattle', () => {
  it('builds a fresh state with both combatants at full HP', () => {
    const s = initManualBattle({ challenger, defender, seed: 42 })
    expect(s.challenger.hp).toBe(s.challenger.maxHp)
    expect(s.defender.hp).toBe(s.defender.maxHp)
    expect(s.turns).toHaveLength(0)
    expect(s.finished).toBe(false)
    expect(s.winner).toBeNull()
  })

  it('higher level moves first', () => {
    const s = initManualBattle({
      challenger: { ...challenger, level: 50 },
      defender: { ...defender, level: 10 },
      seed: 42,
    })
    expect(s.whoseTurn).toBe('challenger')
  })

  it('lower level moves second', () => {
    const s = initManualBattle({
      challenger: { ...challenger, level: 10 },
      defender: { ...defender, level: 50 },
      seed: 42,
    })
    expect(s.whoseTurn).toBe('defender')
  })

  it('exposes 4 moves per side based on stage', () => {
    const s = initManualBattle({ challenger, defender, seed: 1 })
    expect(s.challenger.moves).toHaveLength(4)
    expect(s.defender.moves).toHaveLength(4)
  })
})

describe('applyManualAction', () => {
  it('reduces defender HP and appends a turn', () => {
    const s0 = initManualBattle({ challenger, defender, seed: 1 })
    const s1 = applyManualAction(s0, 0)
    expect(s1.turns).toHaveLength(1)
    const targetSide = s0.whoseTurn === 'challenger' ? 'defender' : 'challenger'
    expect(s1[targetSide].hp).toBeLessThan(s0[targetSide].maxHp)
    expect(s1.whoseTurn).not.toBe(s0.whoseTurn)
  })

  it('damage matches the recorded turn entry', () => {
    const s0 = initManualBattle({ challenger, defender, seed: 1 })
    const s1 = applyManualAction(s0, 0)
    const turn = s1.turns[0]!
    const targetSide = s0.whoseTurn === 'challenger' ? 'defender' : 'challenger'
    expect(turn.defender_hp_after).toBe(s1[targetSide].hp)
    expect(turn.damage).toBeGreaterThan(0)
  })

  it('clamps moveIndex to a valid range', () => {
    const s0 = initManualBattle({ challenger, defender, seed: 1 })
    const s1 = applyManualAction(s0, 99)
    expect(s1.turns).toHaveLength(1) // last move used as fallback
  })

  it('is purely functional — does not mutate input', () => {
    const s0 = initManualBattle({ challenger, defender, seed: 1 })
    const before = JSON.parse(
      JSON.stringify({ turns: s0.turns, c: s0.challenger.hp, d: s0.defender.hp }),
    )
    applyManualAction(s0, 0)
    expect(s0.turns).toHaveLength(0)
    expect(s0.challenger.hp).toBe(before.c)
    expect(s0.defender.hp).toBe(before.d)
  })

  it('marks finished + winner when defender HP reaches 0', () => {
    // Strong attacker, weak defender → finishes fast.
    const c: BattleParticipant = { ...challenger, level: 100 }
    const d: BattleParticipant = { ...defender, level: 1 }
    let s = initManualBattle({ challenger: c, defender: d, seed: 1 })
    let safety = 0
    while (!s.finished && safety < 100) {
      s = applyManualAction(s, 0)
      safety++
    }
    expect(s.finished).toBe(true)
    expect(s.winner).not.toBeNull()
    expect(s.reason).toMatch(/^(ko|turn_limit)$/)
  })

  it('returns same state when already finished (idempotent no-op)', () => {
    let s = initManualBattle({
      challenger: { ...challenger, level: 100 },
      defender: { ...defender, level: 1 },
      seed: 1,
    })
    while (!s.finished) s = applyManualAction(s, 0)
    const after = applyManualAction(s, 0)
    expect(after).toBe(s) // returned same reference
  })
})

describe('determinism', () => {
  it('same seed + same actions → identical turn log', () => {
    const actions = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1]
    let s1 = initManualBattle({ challenger, defender, seed: 1234 })
    let s2 = initManualBattle({ challenger, defender, seed: 1234 })
    for (const a of actions) {
      if (!s1.finished) s1 = applyManualAction(s1, a)
      if (!s2.finished) s2 = applyManualAction(s2, a)
    }
    expect(s1.turns).toEqual(s2.turns)
    expect(s1.winner).toBe(s2.winner)
  })

  it('different seeds → different turn log', () => {
    let s1 = initManualBattle({ challenger, defender, seed: 1 })
    let s2 = initManualBattle({ challenger, defender, seed: 2 })
    s1 = applyManualAction(s1, 0)
    s2 = applyManualAction(s2, 0)
    expect(s1.turns[0]!.damage).not.toBe(s2.turns[0]!.damage) // very high probability
  })
})

describe('chooseAiMove', () => {
  it('returns a valid move index in [0, 3]', () => {
    const s = initManualBattle({ challenger, defender, seed: 1 })
    for (const diff of ['easy', 'normal', 'hard'] as const) {
      const idx = chooseAiMove(s, diff)
      expect(idx).toBeGreaterThanOrEqual(0)
      expect(idx).toBeLessThan(s.challenger.moves.length)
    }
  })

  it('normal difficulty prefers super-effective moves vs grass with fire attacker', () => {
    // Force challenger's turn so we evaluate fire-vs-grass moveset.
    // Fire attacker has Flammèche (fire, power 1.0) → score 2.0 vs grass.
    // All other Charmander moves are normal (×1.0 effectiveness, max power 0.95)
    // so the fire move should be picked.
    const s = initManualBattle({ challenger, defender, seed: 1 })
    const sChallengerTurn: typeof s = { ...s, whoseTurn: 'challenger' }
    const idx = chooseAiMove(sChallengerTurn, 'normal')
    const move = sChallengerTurn.challenger.moves[idx]!
    expect(move.type).toBe('fire')
  })

  it('hard difficulty respects determinism with the same seed', () => {
    const s1 = initManualBattle({ challenger, defender, seed: 5 })
    const s2 = initManualBattle({ challenger, defender, seed: 5 })
    expect(chooseAiMove(s1, 'hard')).toBe(chooseAiMove(s2, 'hard'))
  })
})

describe('playerMoves', () => {
  it('returns the moves of the side whose turn it is', () => {
    const s = initManualBattle({ challenger, defender, seed: 1 })
    const moves = playerMoves(s)
    if (s.whoseTurn === 'challenger') {
      expect(moves).toBe(s.challenger.moves)
    } else {
      expect(moves).toBe(s.defender.moves)
    }
  })
})

describe('stateToResult', () => {
  it('produces a valid BattleResult drop-in', () => {
    let s = initManualBattle({ challenger, defender, seed: 7 })
    s = applyManualAction(s, 0)
    s = applyManualAction(s, 0)
    const result = stateToResult(s)
    expect(result.challenger).toEqual(challenger)
    expect(result.defender).toEqual(defender)
    expect(result.seed).toBe(7)
    expect(result.turns).toHaveLength(2)
    expect(result.battle_id).toBeNull()
  })
})

describe('deriveManualSeed', () => {
  it('is stable for the same inputs', () => {
    expect(deriveManualSeed('a', 'b', 1)).toBe(deriveManualSeed('a', 'b', 1))
  })
  it('differs for different salts', () => {
    expect(deriveManualSeed('a', 'b', 1)).not.toBe(deriveManualSeed('a', 'b', 2))
  })
  it('returns a uint32', () => {
    const s = deriveManualSeed('a', 'b', 1)
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(2 ** 32)
  })
})
