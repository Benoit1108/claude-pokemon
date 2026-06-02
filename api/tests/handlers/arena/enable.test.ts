import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { getArena } from '../../../src/lib/kv'
import { MockKV, makeEnv } from '../../helpers/mockKV'

const validTeam = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 30,
  is_shiny: false,
}

function makeRequest(body: unknown): Request {
  return new Request('https://test/v1/arena/enable', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('handleArenaEnable', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('returns 200 + arena_secret on first enable', async () => {
    const res = await handleArenaEnable(makeRequest(validTeam), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(typeof body.arena_secret).toBe('string')
    expect(body.arena_secret as string).toMatch(/^[a-f0-9]{32}$/)
    expect(body.team_snapshot).toMatchObject({ lineage: 'fire', level: 30 })
  })

  it('persists the record with the SHA-256 hash (never the plaintext)', async () => {
    const res = await handleArenaEnable(makeRequest(validTeam), env)
    const body = (await res.json()) as { arena_secret: string }
    const stored = await getArena(env, 'aaaaaaaa')
    expect(stored).not.toBeNull()
    expect(stored!.secret_hash).toMatch(/^[a-f0-9]{64}$/)
    // The stored hash MUST NOT equal the plaintext secret
    expect(stored!.secret_hash).not.toBe(body.arena_secret)
  })

  it('returns 409 if already enabled', async () => {
    await handleArenaEnable(makeRequest(validTeam), env)
    const res = await handleArenaEnable(makeRequest(validTeam), env)
    expect(res.status).toBe(409)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.error).toBe('already_enabled')
  })

  it('returns 400 on invalid JSON', async () => {
    const req = new Request('https://test/v1/arena/enable', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json',
    })
    const res = await handleArenaEnable(req, env)
    expect(res.status).toBe(400)
  })

  it('returns 400 on malformed lineage', async () => {
    const res = await handleArenaEnable(makeRequest({ ...validTeam, lineage: 'Invalid!' }), env)
    expect(res.status).toBe(400)
  })

  it('accepts a wild / traded lineage (Phase 2.14)', async () => {
    const res = await handleArenaEnable(
      makeRequest({ ...validTeam, lineage: 'trade-psyduck' }),
      env,
    )
    expect(res.status).toBe(200)
  })

  it('returns 400 on level out of range', async () => {
    const res = await handleArenaEnable(makeRequest({ ...validTeam, level: 0 }), env)
    expect(res.status).toBe(400)
    const res2 = await handleArenaEnable(makeRequest({ ...validTeam, level: 101 }), env)
    expect(res2.status).toBe(400)
  })
})
