import { describe, it, expect } from 'vitest'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import { handleAuthLogout } from '../../../src/handlers/auth/logout'
import {
  createSession,
  findOrCreateUserByIdentity,
  getUserFromSessionToken,
} from '../../../src/lib/auth'

const NOW = '2026-06-11T00:00:00.000Z'

function req(token?: string): Request {
  const headers: Record<string, string> = {}
  if (token) headers.authorization = `Bearer ${token}`
  return new Request('https://x/v1/auth/logout', { method: 'POST', headers })
}

describe('POST /v1/auth/logout', () => {
  it('revokes the session server-side', async () => {
    const env = makeEnv(new MockKV())
    const user = await findOrCreateUserByIdentity(
      env,
      { provider: 'github', externalId: '1', github: { id: 1, login: 'u' } },
      NOW,
    )
    const token = await createSession(env, user.user_id, NOW)
    expect(await getUserFromSessionToken(env, token)).not.toBeNull()

    const res = await handleAuthLogout(req(token), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(await getUserFromSessionToken(env, token)).toBeNull() // session gone
  })

  it('is idempotent for a missing or unknown token (always 200)', async () => {
    const env = makeEnv(new MockKV())
    expect((await handleAuthLogout(req(), env)).status).toBe(200)
    expect((await handleAuthLogout(req('a'.repeat(48)), env)).status).toBe(200)
  })
})
