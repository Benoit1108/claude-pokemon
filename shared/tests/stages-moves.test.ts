import { describe, it, expect } from 'vitest'
import {
  LINEAGE_STAGES,
  MOVES,
  STAGE_MOVES,
  movesForParticipant,
  movesForStage,
  stageFor,
} from '../src/index.js'

describe('LINEAGE_STAGES', () => {
  it('every lineage has an egg + at least one Lv.1 stage', () => {
    for (const lineage of Object.keys(LINEAGE_STAGES) as Array<
      keyof typeof LINEAGE_STAGES
    >) {
      const stages = LINEAGE_STAGES[lineage]
      expect(stages[0]?.showdown_id).toBe('egg')
      expect(stages.find(s => s.min_level === 1)).toBeDefined()
    }
  })

  it('stages are sorted by min_level ascending', () => {
    for (const lineage of Object.keys(LINEAGE_STAGES) as Array<
      keyof typeof LINEAGE_STAGES
    >) {
      const stages = LINEAGE_STAGES[lineage]
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i]!.min_level).toBeGreaterThanOrEqual(stages[i - 1]!.min_level)
      }
    }
  })
})

describe('stageFor', () => {
  it('returns egg at level 0', () => {
    expect(stageFor('fire', 0).showdown_id).toBe('egg')
  })

  it('walks tiers correctly for fire lineage', () => {
    expect(stageFor('fire', 1).showdown_id).toBe('charmander')
    expect(stageFor('fire', 15).showdown_id).toBe('charmander')
    expect(stageFor('fire', 16).showdown_id).toBe('charmeleon')
    expect(stageFor('fire', 35).showdown_id).toBe('charmeleon')
    expect(stageFor('fire', 36).showdown_id).toBe('charizard')
    expect(stageFor('fire', 100).showdown_id).toBe('charizard-megay')
  })

  it('falls back to fire when lineage is unknown', () => {
    expect(stageFor('not-a-lineage', 50).showdown_id).toBe('charizard')
  })

  it('eevee defaults to vaporeon at Lv.30+ (first listed)', () => {
    expect(stageFor('eevee', 30).showdown_id).toBe('vaporeon')
    expect(stageFor('eevee', 100).showdown_id).toBe('vaporeon')
  })
})

describe('MOVES + STAGE_MOVES', () => {
  it('every STAGE_MOVES entry references valid MOVES keys', () => {
    for (const [stage, names] of Object.entries(STAGE_MOVES)) {
      expect(names.length).toBe(4)
      for (const name of names) {
        expect(MOVES[name], `${stage} → unknown move "${name}"`).toBeDefined()
      }
    }
  })

  it('every catalogued stage has exactly 4 moves', () => {
    for (const moves of Object.values(STAGE_MOVES)) {
      expect(moves.length).toBe(4)
    }
  })
})

describe('movesForStage', () => {
  it('returns 4 moves for a known stage', () => {
    const moves = movesForStage('charizard')
    expect(moves.length).toBe(4)
    expect(moves[0]?.name).toBe('Lance-Flammes')
  })

  it('falls back to basic moveset on unknown stage', () => {
    const moves = movesForStage('not-a-stage')
    expect(moves.length).toBe(4)
    expect(moves.map(m => m.name)).toEqual(['Charge', 'Mimi-Queue', 'Morsure', 'Tranche'])
  })
})

describe('movesForParticipant', () => {
  it('chains stageFor + movesForStage', () => {
    const moves = movesForParticipant('fire', 50)
    expect(moves[0]?.name).toBe('Lance-Flammes') // = charizard's first move
  })
})
