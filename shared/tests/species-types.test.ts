import { describe, it, expect } from 'vitest'
import {
  COMBAT_TYPES,
  TYPE_CHART,
  lineageToCombatType,
  speciesToCombatType,
  movesForParticipant,
  resolveBattle,
  type BattleParticipant,
} from '../src/index.js'

describe('lineageToCombatType', () => {
  it('keeps starter lineages on their curated type', () => {
    expect(lineageToCombatType('fire')).toBe('fire')
    expect(lineageToCombatType('water')).toBe('water')
    expect(lineageToCombatType('eevee')).toBe('normal')
    expect(lineageToCombatType('cyndaquil')).toBe('fire')
  })

  it('resolves bare and traded species from the wild pool', () => {
    expect(lineageToCombatType('psyduck')).toBe('water')
    expect(lineageToCombatType('trade-psyduck')).toBe('water')
    expect(lineageToCombatType('trade-dratini')).toBe('dragon')
    expect(lineageToCombatType('gengar')).toBe('ghost')
  })

  it('falls back to normal for unknown / empty lineages', () => {
    expect(lineageToCombatType('zzz-not-a-species')).toBe('normal')
    expect(lineageToCombatType('')).toBe('normal')
    expect(lineageToCombatType(null)).toBe('normal')
    expect(speciesToCombatType('nope')).toBe('normal')
  })
})

describe('TYPE_CHART (18 canonical types)', () => {
  it('covers every type both ways', () => {
    expect(COMBAT_TYPES).toHaveLength(18)
    for (const a of COMBAT_TYPES)
      for (const d of COMBAT_TYPES) {
        expect(typeof TYPE_CHART[a][d]).toBe('number')
      }
  })

  it('honours canonical immunities (0×)', () => {
    expect(TYPE_CHART.normal.ghost).toBe(0)
    expect(TYPE_CHART.ghost.normal).toBe(0)
    expect(TYPE_CHART.ground.flying).toBe(0)
    expect(TYPE_CHART.electric.ground).toBe(0)
    expect(TYPE_CHART.dragon.fairy).toBe(0)
  })

  it('keeps the original starter matchups (backward compat)', () => {
    expect(TYPE_CHART.fire.grass).toBe(2)
    expect(TYPE_CHART.water.fire).toBe(2)
    expect(TYPE_CHART.grass.water).toBe(2)
    expect(TYPE_CHART.electric.water).toBe(2)
    expect(TYPE_CHART.fire.water).toBe(0.5)
  })
})

describe('movesForParticipant', () => {
  it('gives wild species a STAB-bearing learnset moveset', () => {
    const moves = movesForParticipant('trade-psyduck', 24)
    expect(moves.length).toBeGreaterThan(0)
    expect(moves.length).toBeLessThanOrEqual(4)
    expect(moves.some(m => m.type === 'water')).toBe(true)
  })

  it('level-gates the learnset', () => {
    const low = movesForParticipant('psyduck', 1)
    const high = movesForParticipant('psyduck', 40)
    expect(low.every(m => m.power <= 1.6)).toBe(true)
    // higher level unlocks at least as strong a top move
    const maxLow = Math.max(...low.map(m => m.power))
    const maxHigh = Math.max(...high.map(m => m.power))
    expect(maxHigh).toBeGreaterThanOrEqual(maxLow)
  })

  it('keeps curated movesets for starters', () => {
    const moves = movesForParticipant('fire', 36)
    expect(moves.map(m => m.name)).toContain('Lance-Flammes')
  })
})

describe('resolveBattle with immunities', () => {
  const mk = (lineage: string, level: number): BattleParticipant => ({
    anon_id: lineage,
    display_name: lineage,
    lineage: lineage as BattleParticipant['lineage'],
    level,
    is_shiny: false,
  })

  it('a mutually-immune matchup runs to the turn limit (no KO)', () => {
    // eevee → normal, gengar → ghost : normal⇄ghost are both 0×.
    const b = resolveBattle({
      challenger: mk('eevee', 30),
      defender: mk('trade-gengar', 30),
      seed: 7,
      createdAt: '2026-06-02T00:00:00Z',
    })
    expect(b.reason).toBe('turn_limit')
    expect(b.turns.every(t => t.damage === 0)).toBe(true)
  })
})
