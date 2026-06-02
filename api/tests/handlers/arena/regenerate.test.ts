import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { handleArenaRegenerate } from '../../../src/handlers/arena/regenerate'
import { getArena } from '../../../src/lib/kv'
import { sha256Hex } from '../../../src/lib/arena'
import { MockKV, makeEnv } from '../../helpers/mockKV'

const team = { anon_id: 'aaaaaaaa', lineage: 'fire', level: 30, is_shiny: false }

async function enable(env: ReturnType<typeof makeEnv>): Promise<string> {
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

describe('handleArenaRegenerate', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('rotates the secret and updates the snapshot', async () => {
    const oldSecret = await enable(env)
    const oldRecord = await getArena(env, 'aaaaaaaa')

    const res = await handleArenaRegenerate(makeReq(oldSecret, { ...team, level: 50 }), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { arena_secret: string; team_snapshot: { level: number } }
    expect(body.arena_secret).not.toBe(oldSecret)
    expect(body.team_snapshot.level).toBe(50)

    const newRecord = await getArena(env, 'aaaaaaaa')
    expect(newRecord!.secret_hash).not.toBe(oldRecord!.secret_hash)
    expect(newRecord!.secret_hash).toBe(await sha256Hex(body.arena_secret))
    expect(newRecord!.enabled_at).toBe(oldRecord!.enabled_at) // preserved
  })

  it('returns 401 when Bearer is missing', async () => {
    await enable(env)
    const res = await handleArenaRegenerate(makeReq(null, team), env)
    expect(res.status).toBe(401)
  })

  it('returns 401 on wrong Bearer', async () => {
    await enable(env)
    const res = await handleArenaRegenerate(makeReq('f'.repeat(32), team), env)
    expect(res.status).toBe(401)
  })

  it('returns 404 when not enabled', async () => {
    const res = await handleArenaRegenerate(makeReq('a'.repeat(32), team), env)
    expect(res.status).toBe(404)
  })

  it('returns 400 on validation errors', async () => {
    const secret = await enable(env)
    const res = await handleArenaRegenerate(makeReq(secret, { ...team, lineage: 'Invalid!' }), env)
    expect(res.status).toBe(400)
  })

  it('returns 400 on invalid JSON', async () => {
    const req = new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + 'a'.repeat(32) },
      body: 'not-json',
    })
    const res = await handleArenaRegenerate(req, env)
    expect(res.status).toBe(400)
  })
})
