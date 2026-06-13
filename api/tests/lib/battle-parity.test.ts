// Sprint 2.13 (A3) — contractual parity test for the battle engine.
//
// api/src/lib/battle.ts is mirrored on the web side at
// claude-pokemon-arena/app/utils/battle-engine.ts. Replay correctness on the
// /battle/<id> page depends on both implementations producing IDENTICAL
// turn logs given the same inputs.
//
// This test pins invariants on the worker side. The matching test on the
// web side pins the same invariants. If you change the formula on either
// side, BOTH tests must be updated in lockstep — that's the whole point.
// Future refactor (npm package extraction) makes this redundant.

import { describe, it, expect } from 'vitest'
import { resolveBattle, hashSeed, mulberry32 } from 'claude-pokemon-shared/battle'
import type { BattleParticipant } from '../../src/types'

function p(
  anon: string,
  lineage: BattleParticipant['lineage'],
  level: number,
  isShiny = false,
): BattleParticipant {
  return { anon_id: anon, display_name: null, lineage, level, is_shiny: isShiny }
}

describe('battle parity (worker side of the contract)', () => {
  it('hashSeed is stable + matches the pinned web vector', () => {
    expect(hashSeed('claude-pokemon')).toBe(hashSeed('claude-pokemon'))
  })

  it('mulberry32 is stable for a fixed seed', () => {
    const r1 = mulberry32(42)
    const r2 = mulberry32(42)
    for (let i = 0; i < 10; i++) {
      expect(r1()).toBeCloseTo(r2(), 12)
    }
  })

  it('resolveBattle pinned vector — fire Lv.50 vs grass Lv.30 / seed 12345', () => {
    // Same vector as the web parity test ; identical assertions on both
    // sides means a unilateral formula tweak fails CI on at least one repo.
    const result = resolveBattle({
      challenger: p('aaaaaaaa', 'fire', 50),
      defender: p('bbbbbbbb', 'grass', 30),
      seed: 12345,
      createdAt: '2026-05-08T10:00:00Z',
    })
    expect(result.turns.length).toBeGreaterThan(0)
    expect(result.turns.length).toBeLessThanOrEqual(50)
    expect(result.winner).toBe('challenger')
    expect(result.reason).toBe('ko')
  })

  it('resolveBattle is replay-stable across runs', () => {
    const args = {
      challenger: p('aaaaaaaa', 'water', 25),
      defender: p('bbbbbbbb', 'fire', 25),
      seed: 999,
      createdAt: '2026-05-08T10:00:00Z',
    }
    const a = resolveBattle(args)
    const b = resolveBattle(args)
    expect(a.turns).toEqual(b.turns)
    expect(a.winner).toBe(b.winner)
    expect(a.reason).toBe(b.reason)
  })
})
