import { describe, it, expect } from 'vitest'
import {
  TYPE_CHART,
  attackPower,
  hashSeed,
  maxHp,
  mulberry32,
  resolveBattle,
} from 'claude-pokemon-shared/battle'
import type { BattleParticipant } from '../../src/types'

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
  lineage: 'water',
  level: 30,
  is_shiny: false,
}

const grassDefender: BattleParticipant = { ...defender, lineage: 'grass' }
const eeveeDefender: BattleParticipant = { ...defender, lineage: 'eevee' }

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b())
    }
  })

  it('differs across seeds', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect(a()).not.toBe(b())
  })

  it('returns values in [0, 1)', () => {
    const rng = mulberry32(123)
    for (let i = 0; i < 100; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('hashSeed', () => {
  it('produces stable uint32 hashes', () => {
    expect(hashSeed('battle-001')).toBe(hashSeed('battle-001'))
    expect(hashSeed('battle-001')).not.toBe(hashSeed('battle-002'))
  })

  it('returns a non-negative integer < 2^32', () => {
    const h = hashSeed('some-id')
    expect(Number.isInteger(h)).toBe(true)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(2 ** 32)
  })
})

describe('TYPE_CHART', () => {
  it('encodes the rock-paper-scissors triangle', () => {
    expect(TYPE_CHART.fire.grass).toBe(2.0)
    expect(TYPE_CHART.grass.water).toBe(2.0)
    expect(TYPE_CHART.water.fire).toBe(2.0)
    expect(TYPE_CHART.fire.water).toBe(0.5)
    expect(TYPE_CHART.water.grass).toBe(0.5)
    expect(TYPE_CHART.grass.fire).toBe(0.5)
  })

  it('makes electric strong vs water and weak vs grass', () => {
    expect(TYPE_CHART.electric.water).toBe(2.0)
    expect(TYPE_CHART.electric.grass).toBe(0.5)
  })

  it('keeps normal (eevee) neutral both ways', () => {
    for (const t of ['fire', 'water', 'grass', 'electric', 'normal'] as const) {
      expect(TYPE_CHART.normal[t]).toBe(1.0)
    }
  })
})

describe('stat derivation', () => {
  it('maxHp scales with level (50 + 2*level)', () => {
    expect(maxHp(1, false)).toBe(52)
    expect(maxHp(50, false)).toBe(150)
    expect(maxHp(100, false)).toBe(250)
  })

  it('shiny gives a +5% stat bonus', () => {
    expect(maxHp(50, true)).toBeGreaterThan(maxHp(50, false))
    expect(attackPower(50, true)).toBeGreaterThan(attackPower(50, false))
  })

  it('attackPower scales with level (10 + level)', () => {
    expect(attackPower(1, false)).toBe(11)
    expect(attackPower(50, false)).toBe(60)
    expect(attackPower(100, false)).toBe(110)
  })
})

describe('resolveBattle', () => {
  const baseArgs = {
    challenger,
    defender,
    seed: 42,
    createdAt: '2026-05-06T10:00:00Z',
  }

  it('is fully deterministic for the same seed', () => {
    const r1 = resolveBattle(baseArgs)
    const r2 = resolveBattle(baseArgs)
    expect(r1.winner).toBe(r2.winner)
    expect(r1.reason).toBe(r2.reason)
    expect(r1.turns).toEqual(r2.turns)
  })

  it('different seeds can produce different outcomes (neutral matchup)', () => {
    // eevee vs eevee at same level → the outcome is dominated by RNG
    const winners = new Set<string>()
    for (let s = 0; s < 50; s++) {
      const r = resolveBattle({
        challenger: { ...challenger, lineage: 'eevee', level: 20 },
        defender: { ...defender, lineage: 'eevee', level: 20 },
        seed: s,
        createdAt: 'x',
      })
      winners.add(r.winner)
    }
    expect(winners.size).toBeGreaterThan(1)
  })

  it('preserves participants in the result', () => {
    const r = resolveBattle(baseArgs)
    expect(r.challenger).toEqual(challenger)
    expect(r.defender).toEqual(defender)
    expect(r.seed).toBe(42)
    expect(r.created_at).toBe('2026-05-06T10:00:00Z')
    expect(r.battle_id).toBeNull()
  })

  it('produces at least one turn', () => {
    const r = resolveBattle(baseArgs)
    expect(r.turns.length).toBeGreaterThan(0)
    expect(r.turns[0]?.turn).toBe(1)
  })

  it('turn numbers are strictly increasing', () => {
    const r = resolveBattle(baseArgs)
    for (let i = 1; i < r.turns.length; i++) {
      expect(r.turns[i]!.turn).toBe(r.turns[i - 1]!.turn + 1)
    }
  })

  it('every turn has a positive damage value', () => {
    const r = resolveBattle(baseArgs)
    for (const t of r.turns) {
      expect(t.damage).toBeGreaterThan(0)
    }
  })

  it('damage roll respects type effectiveness (fire vs grass = 2.0)', () => {
    const r = resolveBattle({ ...baseArgs, defender: grassDefender })
    const fireTurns = r.turns.filter(t => t.actor === 'challenger')
    expect(fireTurns.length).toBeGreaterThan(0)
    expect(fireTurns.every(t => t.effectiveness === 2.0)).toBe(true)
  })

  it('damage roll respects type effectiveness (fire vs water = 0.5)', () => {
    const r = resolveBattle(baseArgs) // fire vs water
    const fireTurns = r.turns.filter(t => t.actor === 'challenger')
    expect(fireTurns.every(t => t.effectiveness === 0.5)).toBe(true)
  })

  it('eevee (normal) has neutral effectiveness vs all', () => {
    const r = resolveBattle({ ...baseArgs, defender: eeveeDefender })
    const fireTurns = r.turns.filter(t => t.actor === 'challenger')
    expect(fireTurns.every(t => t.effectiveness === 1.0)).toBe(true)
  })

  it('higher-level participant attacks first', () => {
    const r = resolveBattle({
      ...baseArgs,
      challenger: { ...challenger, level: 50 },
      defender: { ...defender, level: 10 },
    })
    expect(r.turns[0]?.actor).toBe('challenger')
    expect(r.winner).toBe('challenger') // dominant level + type-neutral or worse → still wins
  })

  it('defender attacks first when defender-level > challenger-level', () => {
    const r = resolveBattle({
      ...baseArgs,
      challenger: { ...challenger, level: 5 },
      defender: { ...defender, level: 50 },
    })
    expect(r.turns[0]?.actor).toBe('defender')
  })

  it('decreases defender_hp_after monotonically per side', () => {
    const r = resolveBattle({ ...baseArgs, defender: grassDefender })
    let lastForChallenger = Infinity
    let lastForDefender = Infinity
    for (const t of r.turns) {
      // when actor=X, defender_hp_after refers to the OTHER side
      if (t.actor === 'challenger') {
        expect(t.defender_hp_after).toBeLessThanOrEqual(lastForDefender)
        lastForDefender = t.defender_hp_after
      } else {
        expect(t.defender_hp_after).toBeLessThanOrEqual(lastForChallenger)
        lastForChallenger = t.defender_hp_after
      }
    }
  })

  it('ends in KO with defender_hp_after = 0 for the losing side', () => {
    const r = resolveBattle({ ...baseArgs, defender: grassDefender }) // fire vs grass: challenger should win quickly
    if (r.reason === 'ko') {
      expect(r.turns[r.turns.length - 1]?.defender_hp_after).toBe(0)
      expect(r.winner).not.toBe('draw')
    }
  })

  it('respects the turn-limit cap (≤ ARENA_MAX_TURNS)', () => {
    // craft a stalemate scenario : two low-level same-type combatants
    const a: BattleParticipant = { ...challenger, lineage: 'eevee', level: 1 }
    const b: BattleParticipant = { ...defender, lineage: 'eevee', level: 1 }
    const r = resolveBattle({ challenger: a, defender: b, seed: 1, createdAt: 'x' })
    expect(r.turns.length).toBeLessThanOrEqual(50)
  })

  it('returns a draw or turn_limit winner when no side faints in time', () => {
    const a: BattleParticipant = { ...challenger, lineage: 'eevee', level: 1 }
    const b: BattleParticipant = { ...defender, lineage: 'eevee', level: 1 }
    const r = resolveBattle({ challenger: a, defender: b, seed: 1, createdAt: 'x' })
    expect(['ko', 'turn_limit']).toContain(r.reason)
    if (r.reason === 'turn_limit') {
      expect(['challenger', 'defender', 'draw']).toContain(r.winner)
    }
  })

  it('shiny gives a measurable but small edge', () => {
    // exact same setup but challenger is shiny → should win more often than not
    const wins = { plain: 0, shiny: 0 }
    for (let s = 0; s < 100; s++) {
      const plain = resolveBattle({
        challenger: { ...challenger, lineage: 'eevee' },
        defender: { ...defender, lineage: 'eevee' },
        seed: s,
        createdAt: 'x',
      })
      if (plain.winner === 'challenger') wins.plain++

      const shinyChal = resolveBattle({
        challenger: { ...challenger, lineage: 'eevee', is_shiny: true },
        defender: { ...defender, lineage: 'eevee' },
        seed: s,
        createdAt: 'x',
      })
      if (shinyChal.winner === 'challenger') wins.shiny++
    }
    expect(wins.shiny).toBeGreaterThanOrEqual(wins.plain)
  })

  it('records critical hits when they occur (probabilistic across seeds)', () => {
    let crits = 0
    for (let s = 0; s < 50; s++) {
      const r = resolveBattle({ ...baseArgs, seed: s })
      crits += r.turns.filter(t => t.critical).length
    }
    expect(crits).toBeGreaterThan(0) // 6.25% per turn × many turns × 50 seeds → very likely > 0
  })
})
