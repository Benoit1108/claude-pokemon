import { describe, it, expect, vi, afterEach } from 'vitest'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import { handleGithubCliSession } from '../../../src/handlers/auth/github-cli-session'
import { getUserFromSessionToken } from '../../../src/lib/auth'

function req(body: unknown): Request {
  return new Request('https://x/v1/auth/github/cli-session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function jsonRes(obj: unknown, ok = true): Response {
  return { ok, json: async () => obj } as unknown as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('POST /v1/auth/github/cli-session', () => {
  it('400 missing_token', async () => {
    const res = await handleGithubCliSession(req({}), makeEnv(new MockKV()))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'missing_token' })
  })

  it('401 github_auth_failed when the token is rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ message: 'Bad credentials' }, false)),
    )
    const res = await handleGithubCliSession(
      req({ access_token: 'gho_bad' }),
      makeEnv(new MockKV()),
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'github_auth_failed' })
  })

  it('200 mints a session for the GitHub user', async () => {
    const env = makeEnv(new MockKV())
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ id: 77, login: 'cli-user' })),
    )
    const res = await handleGithubCliSession(req({ access_token: 'gho_ok' }), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.github).toEqual({ id: 77, login: 'cli-user' })
    const user = await getUserFromSessionToken(env, body.session_token as string)
    expect(user?.user_id).toBe(body.user_id)
  })
})
