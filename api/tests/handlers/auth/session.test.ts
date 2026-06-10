import { describe, it, expect } from 'vitest'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import { handleAuthSession } from '../../../src/handlers/auth/session'
import { createSession, findOrCreateUserByIdentity } from '../../../src/lib/auth'

const NOW = '2026-06-10T12:00:00.000Z'

function req(token?: string): Request {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new Request('https://x/v1/auth/session', { headers })
}

describe('GET /v1/auth/session', () => {
  it('401 missing_bearer when no Authorization header', async () => {
    const res = await handleAuthSession(req(), makeEnv(new MockKV()))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'missing_bearer' })
  })

  it('401 invalid_session for a well-formed but unknown token', async () => {
    const res = await handleAuthSession(req('a'.repeat(48)), makeEnv(new MockKV()))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'invalid_session' })
  })

  it('200 + user for a valid session token', async () => {
    const env = makeEnv(new MockKV())
    const user = await findOrCreateUserByIdentity(
      env,
      { provider: 'github', externalId: '7', github: { id: 7, login: 'kev' } },
      NOW,
    )
    const token = await createSession(env, user.user_id, NOW)
    const res = await handleAuthSession(req(token), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.user_id).toBe(user.user_id)
    expect(body.github).toEqual({ id: 7, login: 'kev' })
    expect(body.linked_anon_ids).toEqual([])
  })
})
