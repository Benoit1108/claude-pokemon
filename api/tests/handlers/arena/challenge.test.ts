import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { handleArenaChallenge } from '../../../src/handlers/arena/challenge'
import { getBattle } from '../../../src/lib/kv'
import { MockKV, makeEnv } from '../../helpers/mockKV'

const challenger = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 50,
  is_shiny: false,
}
const defender = {
  anon_id: 'bbbbbbbb',
  display_name: 'Misty',
  lineage: 'grass', // fire vs grass = 2.0 → challenger should win quickly
  level: 30,
  is_shiny: false,
}

async function enable(env: ReturnType<typeof makeEnv>, team: typeof challenger): Promise<string> {
  const res = await handleArenaEnable(
    new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(team),
    }),
    env,
  )
  return ((await res.json()) as { arena_secret: string }).arena_secret
}

function makeReq(secret: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret) headers.authorization = `Bearer ${secret}`
  return new Request('https://x', { method: 'POST', headers, body: JSON.stringify(body) })
}

describe('handleArenaChallenge', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('resolves a battle and persists it (200)', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)

    const res = await handleArenaChallenge(
      makeReq(cSecret, {
        challenger_anon_id: 'aaaaaaaa',
        defender_anon_id: 'bbbbbbbb',
      }),
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      battle: { battle_id: string; winner: string; turns: unknown[] }
    }
    expect(body.battle.battle_id).toMatch(/^[a-f0-9]{32}$/)
    expect(['challenger', 'defender', 'draw']).toContain(body.battle.winner)
    expect(body.battle.turns.length).toBeGreaterThan(0)

    // Persisted in KV
    const stored = await getBattle(env, body.battle.battle_id)
    expect(stored).not.toBeNull()
    expect(stored!.battle_id).toBe(body.battle.battle_id)
  })

  it('rate-limits a second challenge within the cooldown window (429)', async () => {
    const cSecret = await enable(env, challenger)
    await enable(env, defender)

    await handleArenaChallenge(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    const res2 = await handleArenaChallenge(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    expect(res2.status).toBe(429)
    const body = (await res2.json()) as { cooldown_remaining_s: number }
    expect(body.cooldown_remaining_s).toBeGreaterThan(0)
  })

  it('returns 401 when Bearer is missing', async () => {
    await enable(env, challenger)
    await enable(env, defender)
    const res = await handleArenaChallenge(
      makeReq(null, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('returns 401 on wrong secret', async () => {
    await enable(env, challenger)
    await enable(env, defender)
    const res = await handleArenaChallenge(
      makeReq('f'.repeat(32), {
        challenger_anon_id: 'aaaaaaaa',
        defender_anon_id: 'bbbbbbbb',
      }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('returns 403 when challenger is not enabled', async () => {
    await enable(env, defender)
    const res = await handleArenaChallenge(
      makeReq('a'.repeat(32), {
        challenger_anon_id: 'aaaaaaaa',
        defender_anon_id: 'bbbbbbbb',
      }),
      env,
    )
    expect(res.status).toBe(403)
  })

  it('returns 404 when defender is not enabled', async () => {
    const cSecret = await enable(env, challenger)
    const res = await handleArenaChallenge(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    expect(res.status).toBe(404)
  })

  it('returns 400 on cannot_challenge_self', async () => {
    const cSecret = await enable(env, challenger)
    const res = await handleArenaChallenge(
      makeReq(cSecret, { challenger_anon_id: 'aaaaaaaa', defender_anon_id: 'aaaaaaaa' }),
      env,
    )
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('cannot_challenge_self')
  })

  it('returns 400 on invalid anon_id', async () => {
    const res = await handleArenaChallenge(
      makeReq('a'.repeat(32), { challenger_anon_id: 'BAD!', defender_anon_id: 'bbbbbbbb' }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid JSON', async () => {
    const req = new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 'a'.repeat(32) },
      body: 'not-json',
    })
    const res = await handleArenaChallenge(req, env)
    expect(res.status).toBe(400)
  })
})
