import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaBattle } from '../../../src/handlers/arena/battle'
import { putBattle } from '../../../src/lib/kv'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import type { BattleResult } from '../../../src/types'

function fakeBattle(id: string): BattleResult {
  return {
    battle_id: id,
    challenger: {
      anon_id: 'aaaaaaaa',
      display_name: 'Ash',
      lineage: 'fire',
      level: 30,
      is_shiny: false,
    },
    defender: {
      anon_id: 'bbbbbbbb',
      display_name: 'Misty',
      lineage: 'water',
      level: 30,
      is_shiny: false,
    },
    seed: 42,
    turns: [
      {
        turn: 1,
        actor: 'challenger',
        damage: 5,
        effectiveness: 0.5,
        critical: false,
        defender_hp_after: 105,
      },
    ],
    winner: 'defender',
    reason: 'ko',
    created_at: '2026-05-06T10:00:00Z',
  }
}

describe('handleArenaBattle', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('returns the persisted battle on valid id', async () => {
    const id = 'a'.repeat(32)
    await putBattle(env, fakeBattle(id))
    const res = await handleArenaBattle(`/v1/arena/battle/${id}`, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { battle: { battle_id: string } }
    expect(body.battle.battle_id).toBe(id)
  })

  it('returns 400 on malformed battle_id', async () => {
    const res = await handleArenaBattle('/v1/arena/battle/BAD!', env)
    expect(res.status).toBe(400)
  })

  it('returns 404 when battle does not exist', async () => {
    const res = await handleArenaBattle(`/v1/arena/battle/${'a'.repeat(32)}`, env)
    expect(res.status).toBe(404)
  })
})
