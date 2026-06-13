import { describe, it, expect, beforeEach } from 'vitest'
import { handleForget } from '../../src/handlers/forget'
import { handleArenaEnable } from '../../src/handlers/arena/enable'
import { setCooldown, getStats, getCooldown } from '../../src/lib/kv'
import { MockKV, makeEnv } from '../helpers/mockKV'

const trainer = {
  anon_id: 'abc12345',
  display_name: 'Ash',
  lineage: 'fire',
  level: 25,
  is_shiny: false,
}

async function enable(env: ReturnType<typeof makeEnv>): Promise<string> {
  const res = await handleArenaEnable(
    new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trainer),
    }),
    env,
  )
  return ((await res.json()) as { arena_secret: string }).arena_secret
}

function forgetReq(secret: string | null, anonId = 'abc12345'): Request {
  const headers: Record<string, string> = {}
  if (secret) headers.authorization = `Bearer ${secret}`
  return new Request(`https://test/v1/forget?anon_id=${anonId}`, { method: 'DELETE', headers })
}

describe('handleForget', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('purges record + cooldown for the owner (valid secret)', async () => {
    const secret = await enable(env)
    await setCooldown(env, 'abc12345', 86400)
    expect(await getStats(env, 'abc12345')).not.toBeNull()

    const res = await handleForget(forgetReq(secret), new URL(forgetReq(secret).url), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; forgotten: string }
    expect(body.ok).toBe(true)
    expect(body.forgotten).toBe('abc12345')
    expect(await getStats(env, 'abc12345')).toBeNull()
    expect(await getCooldown(env, 'abc12345')).toBeNull()
  })

  it('rejects an unauthenticated delete (no Bearer) — the security fix', async () => {
    await enable(env)
    const req = forgetReq(null)
    const res = await handleForget(req, new URL(req.url), env)
    expect(res.status).toBe(401)
    expect(await getStats(env, 'abc12345')).not.toBeNull() // record survives
  })

  it('rejects a wrong secret with 401', async () => {
    await enable(env)
    const req = forgetReq('deadbeefdeadbeefdeadbeefdeadbeef')
    const res = await handleForget(req, new URL(req.url), env)
    expect(res.status).toBe(401)
    expect(await getStats(env, 'abc12345')).not.toBeNull()
  })

  it('returns 403 for a trainer that never enabled the arena (no secret to prove)', async () => {
    // well-formed bearer (passes extractBearer's hex check) but no arena record
    const req = forgetReq('deadbeefdeadbeefdeadbeefdeadbeef')
    const res = await handleForget(req, new URL(req.url), env)
    expect(res.status).toBe(403)
  })

  it('returns 400 on missing / malformed anon_id', async () => {
    const r1 = new Request('https://test/v1/forget', { method: 'DELETE' })
    expect((await handleForget(r1, new URL(r1.url), env)).status).toBe(400)
    const r2 = forgetReq('x', 'BAD-ID!')
    expect((await handleForget(r2, new URL(r2.url), env)).status).toBe(400)
  })
})
