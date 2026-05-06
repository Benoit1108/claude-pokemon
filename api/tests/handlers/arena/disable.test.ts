import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { handleArenaDisable } from '../../../src/handlers/arena/disable'
import { getArena } from '../../../src/lib/kv'
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
  const body = (await res.json()) as { arena_secret: string }
  return body.arena_secret
}

function makeReq(secret: string | null): Request {
  const headers: Record<string, string> = {}
  if (secret) headers.authorization = `Bearer ${secret}`
  return new Request('https://x', { method: 'DELETE', headers })
}

describe('handleArenaDisable', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('removes the arena record with a valid Bearer secret', async () => {
    const secret = await enable(env)
    const url = new URL('https://x/v1/arena/disable?anon_id=aaaaaaaa')
    const res = await handleArenaDisable(makeReq(secret), url, env)
    expect(res.status).toBe(200)
    expect(await getArena(env, 'aaaaaaaa')).toBeNull()
  })

  it('returns 401 when Bearer is missing', async () => {
    await enable(env)
    const url = new URL('https://x/v1/arena/disable?anon_id=aaaaaaaa')
    const res = await handleArenaDisable(makeReq(null), url, env)
    expect(res.status).toBe(401)
  })

  it('returns 401 with a wrong Bearer secret', async () => {
    await enable(env)
    const url = new URL('https://x/v1/arena/disable?anon_id=aaaaaaaa')
    const res = await handleArenaDisable(makeReq('f'.repeat(32)), url, env)
    expect(res.status).toBe(401)
    // record is preserved
    expect(await getArena(env, 'aaaaaaaa')).not.toBeNull()
  })

  it('returns 404 when not enabled', async () => {
    const url = new URL('https://x/v1/arena/disable?anon_id=aaaaaaaa')
    const res = await handleArenaDisable(makeReq('a'.repeat(32)), url, env)
    expect(res.status).toBe(404)
  })

  it('returns 400 on invalid anon_id', async () => {
    const url = new URL('https://x/v1/arena/disable?anon_id=BAD!')
    const res = await handleArenaDisable(makeReq('a'.repeat(32)), url, env)
    expect(res.status).toBe(400)
  })
})
