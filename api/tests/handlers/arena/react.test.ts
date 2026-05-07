import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaReact } from '../../../src/handlers/arena/react'
import { putBattle, putBattleReactions, getBattleReactions } from '../../../src/lib/kv'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import type { BattleResult } from '../../../src/types'

const battleId = 'a'.repeat(32)

function fakeBattle(): BattleResult {
  return {
    battle_id: battleId,
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
        damage: 10,
        effectiveness: 0.5,
        critical: false,
        defender_hp_after: 100,
      },
    ],
    winner: 'defender',
    reason: 'ko',
    created_at: '2026-05-06T10:00:00Z',
  }
}

function makeReq(body: unknown): Request {
  return new Request(`https://x/v1/arena/battle/${battleId}/react`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const PATH = `/v1/arena/battle/${battleId}/react`

describe('handleArenaReact', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(async () => {
    kv = new MockKV()
    env = makeEnv(kv)
    await putBattle(env, fakeBattle())
  })

  it('records a reaction and increments the count', async () => {
    const res = await handleArenaReact(
      makeReq({ anon_id: 'cccccccc', reaction: 'fire' }),
      PATH,
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; reactions: Record<string, number> }
    expect(body.ok).toBe(true)
    expect(body.reactions.fire).toBe(1)

    const stored = await getBattleReactions(env, battleId)
    expect(stored.counts.fire).toBe(1)
    expect(stored.voters.cccccccc).toBe('fire')
  })

  it('changing reaction decrements the previous and increments the new one', async () => {
    await handleArenaReact(makeReq({ anon_id: 'cccccccc', reaction: 'fire' }), PATH, env)
    const res = await handleArenaReact(
      makeReq({ anon_id: 'cccccccc', reaction: 'clap' }),
      PATH,
      env,
    )
    const body = (await res.json()) as { reactions: Record<string, number> }
    expect(body.reactions.fire).toBe(0)
    expect(body.reactions.clap).toBe(1)
  })

  it('same reaction twice = idempotent (count stays 1)', async () => {
    await handleArenaReact(makeReq({ anon_id: 'cccccccc', reaction: 'fire' }), PATH, env)
    const res = await handleArenaReact(
      makeReq({ anon_id: 'cccccccc', reaction: 'fire' }),
      PATH,
      env,
    )
    const body = (await res.json()) as { reactions: Record<string, number> }
    expect(body.reactions.fire).toBe(1)
  })

  it('multiple voters add up', async () => {
    await handleArenaReact(makeReq({ anon_id: 'cccccccc', reaction: 'fire' }), PATH, env)
    await handleArenaReact(makeReq({ anon_id: 'dddddddd', reaction: 'fire' }), PATH, env)
    await handleArenaReact(makeReq({ anon_id: 'eeeeeeee', reaction: 'clap' }), PATH, env)
    const stored = await getBattleReactions(env, battleId)
    expect(stored.counts.fire).toBe(2)
    expect(stored.counts.clap).toBe(1)
  })

  it('returns 400 on invalid anon_id', async () => {
    const res = await handleArenaReact(makeReq({ anon_id: 'BAD!', reaction: 'fire' }), PATH, env)
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid reaction key', async () => {
    const res = await handleArenaReact(
      makeReq({ anon_id: 'cccccccc', reaction: 'angry' }),
      PATH,
      env,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { allowed: string[] }
    expect(body.allowed).toContain('fire')
  })

  it('returns 400 on missing fields', async () => {
    const res = await handleArenaReact(makeReq({ anon_id: 'cccccccc' }), PATH, env)
    expect(res.status).toBe(400)
    const res2 = await handleArenaReact(makeReq({ reaction: 'fire' }), PATH, env)
    expect(res2.status).toBe(400)
  })

  it('returns 400 on invalid JSON', async () => {
    const req = new Request(`https://x${PATH}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    const res = await handleArenaReact(req, PATH, env)
    expect(res.status).toBe(400)
  })

  it('returns 400 on malformed path', async () => {
    const res = await handleArenaReact(
      makeReq({ anon_id: 'cccccccc', reaction: 'fire' }),
      '/v1/arena/battle/BAD!/react',
      env,
    )
    expect(res.status).toBe(400)
  })

  it('returns 404 when battle does not exist', async () => {
    kv.clear()
    const res = await handleArenaReact(
      makeReq({ anon_id: 'cccccccc', reaction: 'fire' }),
      PATH,
      env,
    )
    expect(res.status).toBe(404)
  })

  it('persists across separate handler calls (read your write)', async () => {
    await handleArenaReact(makeReq({ anon_id: 'cccccccc', reaction: 'party' }), PATH, env)
    await handleArenaReact(makeReq({ anon_id: 'dddddddd', reaction: 'lol' }), PATH, env)
    const stored = await getBattleReactions(env, battleId)
    expect(stored.counts.party).toBe(1)
    expect(stored.counts.lol).toBe(1)
    expect(stored.voters.cccccccc).toBe('party')
    expect(stored.voters.dddddddd).toBe('lol')
  })

  it('GET battle endpoint returns the reaction counts', async () => {
    await putBattleReactions(env, battleId, {
      counts: { clap: 3, fire: 5, party: 1, lol: 0, tear: 0, love: 2 },
      voters: {},
    })
    const { handleArenaBattle } = await import('../../../src/handlers/arena/battle')
    const res = await handleArenaBattle(`/v1/arena/battle/${battleId}`, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { reactions: Record<string, number> }
    expect(body.reactions.fire).toBe(5)
    expect(body.reactions.love).toBe(2)
  })
})
