import { describe, it, expect } from 'vitest'
import {
  ARENA_MAX_TURNS,
  TYPE_CHART,
  attackPower,
  deriveHpFromTurns,
  hashSeed,
  maxHp,
  mulberry32,
  resolveBattle,
  type BattleParticipant,
  type BattleTurn,
} from '../src/index.js'

function p(
  anon: string,
  lineage: BattleParticipant['lineage'],
  level: number,
  isShiny = false,
): BattleParticipant {
  return { anon_id: anon, display_name: null, lineage, level, is_shiny: isShiny }
}

describe('TYPE_CHART', () => {
  it('encodes the rock-paper-scissors loop', () => {
    expect(TYPE_CHART.fire.grass).toBe(2.0)
    expect(TYPE_CHART.grass.water).toBe(2.0)
    expect(TYPE_CHART.water.fire).toBe(2.0)
    expect(TYPE_CHART.electric.water).toBe(2.0)
  })

  it('encodes the resistances', () => {
    expect(TYPE_CHART.water.grass).toBe(0.5)
    expect(TYPE_CHART.grass.fire).toBe(0.5)
    expect(TYPE_CHART.fire.water).toBe(0.5)
    expect(TYPE_CHART.electric.grass).toBe(0.5)
  })

  it('normal is always neutral', () => {
    for (const t of ['fire', 'water', 'grass', 'electric', 'normal'] as const) {
      expect(TYPE_CHART.normal[t]).toBe(1.0)
      expect(TYPE_CHART[t].normal).toBe(1.0)
    }
  })
})

describe('stats', () => {
  it('maxHp scales with level + 5% bonus for shiny', () => {
    expect(maxHp(1, false)).toBe(52)
    expect(maxHp(50, false)).toBe(150)
    expect(maxHp(100, false)).toBe(250)
    expect(maxHp(50, true)).toBe(Math.round(150 * 1.05))
  })

  it('attackPower scales with level + 5% bonus for shiny', () => {
    expect(attackPower(1, false)).toBe(11)
    expect(attackPower(50, false)).toBe(60)
    expect(attackPower(50, true)).toBe(Math.round(60 * 1.05))
  })
})

describe('mulberry32 + hashSeed', () => {
  it('mulberry32 is deterministic', () => {
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    for (let i = 0; i < 16; i++) expect(r1()).toBeCloseTo(r2(), 12)
  })

  it('hashSeed is stable', () => {
    expect(hashSeed('claude-pokemon')).toBe(hashSeed('claude-pokemon'))
    expect(hashSeed('a')).not.toBe(hashSeed('b'))
  })
})

describe('resolveBattle', () => {
  const created = '2026-05-08T10:00:00Z'

  it('replay-stable for the same inputs', () => {
    const args = {
      challenger: p('aaaaaaaa', 'water', 25),
      defender: p('bbbbbbbb', 'fire', 25),
      seed: 999,
      createdAt: created,
    }
    const a = resolveBattle(args)
    const b = resolveBattle(args)
    expect(a.turns).toEqual(b.turns)
    expect(a.winner).toBe(b.winner)
  })

  it('challenger Lv.50 fire vs Lv.30 grass → KO winner=challenger', () => {
    const r = resolveBattle({
      challenger: p('aaaaaaaa', 'fire', 50),
      defender: p('bbbbbbbb', 'grass', 30),
      seed: 12345,
      createdAt: created,
    })
    expect(r.winner).toBe('challenger')
    expect(r.reason).toBe('ko')
    expect(r.turns.length).toBeGreaterThan(0)
    expect(r.turns.length).toBeLessThanOrEqual(ARENA_MAX_TURNS)
  })

  it('different seeds produce different damage sequences', () => {
    const base = {
      challenger: p('aaaaaaaa', 'electric', 30),
      defender: p('bbbbbbbb', 'water', 30),
      createdAt: created,
    }
    const a = resolveBattle({ ...base, seed: 1 })
    const b = resolveBattle({ ...base, seed: 2 })
    const aSig = a.turns.map(t => `${t.actor}:${t.damage}:${t.critical ? 1 : 0}`).join('|')
    const bSig = b.turns.map(t => `${t.actor}:${t.damage}:${t.critical ? 1 : 0}`).join('|')
    expect(aSig).not.toBe(bSig)
  })

  it('turn order : higher level first', () => {
    const r = resolveBattle({
      challenger: p('aaaaaaaa', 'fire', 50),
      defender: p('bbbbbbbb', 'water', 10),
      seed: 1,
      createdAt: created,
    })
    expect(r.turns[0]!.actor).toBe('challenger')
  })
})

describe('deriveHpFromTurns', () => {
  function turn(actor: 'challenger' | 'defender', hpAfter: number): BattleTurn {
    return {
      turn: 0,
      actor,
      damage: 5,
      effectiveness: 1,
      critical: false,
      defender_hp_after: hpAfter,
    }
  }

  it('returns max when no turns provided', () => {
    expect(deriveHpFromTurns('challenger', undefined, 100)).toBe(100)
    expect(deriveHpFromTurns('defender', [], 80)).toBe(80)
  })

  it('interleaves correctly', () => {
    const turns = [
      turn('challenger', 90), // defender = 90
      turn('defender', 95), // challenger = 95
      turn('challenger', 70), // defender = 70
      turn('defender', 60), // challenger = 60
    ]
    expect(deriveHpFromTurns('challenger', turns, 100)).toBe(60)
    expect(deriveHpFromTurns('defender', turns, 100)).toBe(70)
  })

  it("ignores turns where the requested side wasn't hit", () => {
    const turns = [turn('challenger', 80), turn('challenger', 30)]
    expect(deriveHpFromTurns('challenger', turns, 100)).toBe(100)
    expect(deriveHpFromTurns('defender', turns, 100)).toBe(30)
  })
})
