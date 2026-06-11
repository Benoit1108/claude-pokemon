import { describe, it, expect } from 'vitest'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import type { Env } from '../../../src/env.d'
import { handleLinkAnon } from '../../../src/handlers/auth/link-anon'
import {
  createSession,
  findOrCreateUserByIdentity,
  getUserFromSessionToken,
} from '../../../src/lib/auth'
import { sha256Hex } from '../../../src/lib/arena'

const NOW = '2026-06-11T00:00:00.000Z'
const ANON = 'a1b2c3d4'
const SECRET = 'f'.repeat(40)

async function seedArena(env: Env, anonId: string, secret: string): Promise<void> {
  await env.STATS.put(
    `arena:${anonId}`,
    JSON.stringify({ anon_id: anonId, secret_hash: await sha256Hex(secret) }),
  )
}

function req(token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request('https://x/v1/auth/link-anon', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

async function userSession(env: Env, ext: string) {
  const user = await findOrCreateUserByIdentity(
    env,
    { provider: 'github', externalId: ext, github: { id: Number(ext), login: `u${ext}` } },
    NOW,
  )
  const token = await createSession(env, user.user_id, NOW)
  return { user, token }
}

describe('POST /v1/auth/link-anon', () => {
  it('401 without a session bearer', async () => {
    const res = await handleLinkAnon(req(null, { anon_id: ANON, arena_secret: SECRET }), makeEnv())
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'missing_bearer' })
  })

  it('401 invalid_session for an unknown token', async () => {
    const res = await handleLinkAnon(
      req('a'.repeat(48), { anon_id: ANON, arena_secret: SECRET }),
      makeEnv(),
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_session' })
  })

  it('400 invalid_anon_id', async () => {
    const env = makeEnv(new MockKV())
    const { token } = await userSession(env, '1')
    const res = await handleLinkAnon(req(token, { anon_id: 'BAD!', arena_secret: SECRET }), env)
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_anon_id' })
  })

  it('404 when the anon account does not exist', async () => {
    const env = makeEnv(new MockKV())
    const { token } = await userSession(env, '1')
    const res = await handleLinkAnon(req(token, { anon_id: ANON, arena_secret: SECRET }), env)
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'anon_not_found' })
  })

  it('401 invalid_secret for a wrong arena_secret', async () => {
    const env = makeEnv(new MockKV())
    const { token } = await userSession(env, '1')
    await seedArena(env, ANON, SECRET)
    const res = await handleLinkAnon(req(token, { anon_id: ANON, arena_secret: 'deadbeef' }), env)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_secret' })
  })

  it('200 links the anon to the user, and is idempotent', async () => {
    const env = makeEnv(new MockKV())
    const { user, token } = await userSession(env, '1')
    await seedArena(env, ANON, SECRET)

    const res = await handleLinkAnon(req(token, { anon_id: ANON, arena_secret: SECRET }), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.linked_anon_ids).toEqual([ANON])

    // persisted on the user
    const refreshed = await getUserFromSessionToken(env, token)
    expect(refreshed?.linked_anon_ids).toEqual([ANON])

    // linking again → still one entry
    await handleLinkAnon(req(token, { anon_id: ANON, arena_secret: SECRET }), env)
    const again = await getUserFromSessionToken(env, token)
    expect(again?.linked_anon_ids).toEqual([ANON])
    expect(user.user_id).toBe(refreshed?.user_id)
  })

  it('409 when the anon is already linked to another user (anti-takeover)', async () => {
    const env = makeEnv(new MockKV())
    await seedArena(env, ANON, SECRET)
    const a = await userSession(env, '1')
    await handleLinkAnon(req(a.token, { anon_id: ANON, arena_secret: SECRET }), env)

    const b = await userSession(env, '2')
    const res = await handleLinkAnon(req(b.token, { anon_id: ANON, arena_secret: SECRET }), env)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already_linked' })
  })
})
