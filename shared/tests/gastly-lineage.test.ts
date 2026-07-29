// The Gastly line is the first Ghost-type lineage. It was originally shipped
// as CLI data only, which left every `shared` lookup table 8-keyed: the
// combat type fell back to 'normal', and normal→ghost is 0 in the chart — a
// Gastly could neither damage nor be damaged by a real Ghost. These tests pin
// the whole resolution chain so a future lineage can't regress the same way.
import { describe, it, expect } from 'vitest'
import {
  ALLOWED_LINEAGES,
  LINEAGE_STAGES,
  LINEAGE_TO_TYPE,
  MOVES,
  STAGE_MOVES,
  lineageToCombatType,
  movesForParticipant,
  resolveBattle,
  stageFor,
  typeMatchMultiplier,
  type BattleParticipant,
} from '../src/index.js'

const GASTLY_STAGES = ['gastly', 'haunter', 'gengar', 'gengar-mega', 'gengar-gmax']

describe('gastly lineage — type resolution', () => {
  it('is an accepted lineage', () => {
    expect(ALLOWED_LINEAGES.has('gastly')).toBe(true)
  })

  it('resolves to the ghost combat type', () => {
    expect(LINEAGE_TO_TYPE.gastly).toBe('ghost')
    expect(lineageToCombatType('gastly')).toBe('ghost')
  })

  it('agrees with the generated species map (the naming pays off here)', () => {
    // `gastly` is both the lineage key and the species id, so the curated
    // mapping and the wild-pool-derived one must not disagree.
    expect(lineageToCombatType('gastly')).toBe(lineageToCombatType('trade-gastly'))
  })
})

describe('gastly lineage — stages', () => {
  it('walks the canon curve', () => {
    expect(stageFor('gastly', 0).showdown_id).toBe('egg')
    expect(stageFor('gastly', 1).showdown_id).toBe('gastly')
    expect(stageFor('gastly', 24).showdown_id).toBe('gastly')
    expect(stageFor('gastly', 25).showdown_id).toBe('haunter')
    expect(stageFor('gastly', 36).showdown_id).toBe('gengar')
    expect(stageFor('gastly', 55).showdown_id).toBe('gengar-mega')
    expect(stageFor('gastly', 100).showdown_id).toBe('gengar-gmax')
  })

  it('does not fall through to the fire lineage', () => {
    expect(LINEAGE_STAGES.gastly).toBeDefined()
    expect(stageFor('gastly', 36).showdown_id).not.toBe(stageFor('fire', 36).showdown_id)
  })
})

describe('gastly lineage — moves', () => {
  it('catalogues a moveset for every stage', () => {
    for (const id of GASTLY_STAGES) {
      expect(STAGE_MOVES[id], id).toHaveLength(4)
    }
  })

  it('every catalogued move name resolves in MOVES', () => {
    for (const id of GASTLY_STAGES) {
      for (const name of STAGE_MOVES[id]!) {
        expect(MOVES[name], `${id} → ${name}`).toBeDefined()
      }
    }
  })

  it('carries ghost STAB from the first stage on', () => {
    for (const level of [1, 25, 36, 55, 100]) {
      const moves = movesForParticipant('gastly', level)
      expect(
        moves.some(m => m.type === 'ghost'),
        `Lv.${level}`,
      ).toBe(true)
    }
  })

  it("leaves Ball'Ombre normal-typed (umbreon / typhlosion-hisui balance)", () => {
    expect(MOVES["Ball'Ombre"]?.type).toBe('normal')
  })
})

describe('gastly lineage — xp', () => {
  it('is rewarded in the saturated-context band only', () => {
    expect(typeMatchMultiplier('gastly', 50)).toBe(1.0)
    expect(typeMatchMultiplier('gastly', 79)).toBe(1.0)
    expect(typeMatchMultiplier('gastly', 80)).toBe(1.2)
    expect(typeMatchMultiplier('gastly', 95)).toBe(1.2)
  })
})

describe('gastly lineage — battle', () => {
  const p = (anon: string, lineage: string, level: number): BattleParticipant => ({
    anon_id: anon,
    display_name: null,
    lineage: lineage as BattleParticipant['lineage'],
    level,
    is_shiny: false,
  })

  const created = '2026-07-29T10:00:00Z'

  it('trades real damage with another ghost (the 0-damage regression)', () => {
    const r = resolveBattle({
      challenger: p('aaaaaaaa', 'gastly', 36),
      defender: p('bbbbbbbb', 'gastly', 36),
      seed: 4242,
      createdAt: created,
    })
    expect(r.turns.length).toBeGreaterThan(0)
    expect(r.turns.some(t => t.damage > 0)).toBe(true)
    expect(r.reason).toBe('ko')
  })

  // Canon: Normal and Ghost are mutually immune (normal→ghost = 0 AND
  // ghost→normal = 0). With single-typed combatants that makes the matchup an
  // unwinnable stalemate. This is NOT specific to the lineage — a wild or
  // traded Gastly already resolved to 'ghost', so the arena could always
  // produce it; the lineage just makes it reachable from a starter. Pinned
  // here so the behaviour is a documented decision rather than a surprise.
  it('stalemates against a normal-type opponent (mutual immunity, canon)', () => {
    const r = resolveBattle({
      challenger: p('aaaaaaaa', 'eevee', 36),
      defender: p('bbbbbbbb', 'gastly', 36),
      seed: 777,
      createdAt: created,
    })
    expect(r.turns.every(t => t.damage === 0 && t.effectiveness === 0)).toBe(true)
    expect(r.reason).toBe('turn_limit')
    expect(r.winner).toBe('draw')
  })

  it('hits psychic for 2× and takes 2× from dark', () => {
    // ghost → psychic = 2. Confirms the chart is reached through the lineage
    // key and not short-circuited to 'normal' (which would give 1×).
    const vsPsychic = resolveBattle({
      challenger: p('aaaaaaaa', 'gastly', 36),
      defender: p('bbbbbbbb', 'trade-alakazam', 36),
      seed: 31337,
      createdAt: created,
    })
    expect(vsPsychic.turns.some(t => t.actor === 'challenger' && t.effectiveness === 2)).toBe(true)

    // dark → ghost = 2, so a Ghost is weak to Dark, not resistant to it.
    const vsDark = resolveBattle({
      challenger: p('aaaaaaaa', 'trade-umbreon', 36),
      defender: p('bbbbbbbb', 'gastly', 36),
      seed: 5150,
      createdAt: created,
    })
    expect(vsDark.turns.some(t => t.actor === 'challenger' && t.effectiveness === 2)).toBe(true)
  })
})
