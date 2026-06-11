import { describe, it, expect, vi, afterEach } from 'vitest'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import type { Env } from '../../../src/env.d'
import { handleGithubExchange } from '../../../src/handlers/auth/github-exchange'
import { getUserFromSessionToken } from '../../../src/lib/auth'

function envWithGithub(kv = new MockKV()): Env {
  return { ...makeEnv(kv), GITHUB_CLIENT_ID: 'cid', GITHUB_CLIENT_SECRET: 'secret' }
}

function req(body: unknown): Request {
  return new Request('https://x/v1/auth/github/exchange', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function jsonRes(obj: unknown, ok = true): Response {
  return { ok, json: async () => obj } as unknown as Response
}

afterEach(() => vi.unstubAllGlobals())

describe('POST /v1/auth/github/exchange', () => {
  it('400 missing_code', async () => {
    const res = await handleGithubExchange(
      req({ redirect_uri: 'http://localhost:3000/auth/github/callback' }),
      envWithGithub(),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'missing_code' })
  })

  it('400 invalid_redirect_uri for a non-allowlisted callback', async () => {
    const res = await handleGithubExchange(
      req({ code: 'c', redirect_uri: 'https://evil.example.com/auth/github/callback' }),
      envWithGithub(),
    )
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_redirect_uri' })
  })

  it('503 when GitHub OAuth is unconfigured', async () => {
    const res = await handleGithubExchange(
      req({ code: 'c', redirect_uri: 'http://localhost:3000/auth/github/callback' }),
      makeEnv(new MockKV()),
    )
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'github_oauth_unconfigured' })
  })

  it('401 github_auth_failed when the code exchange returns no token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ error: 'bad_verification_code' })),
    )
    const res = await handleGithubExchange(
      req({ code: 'bad', redirect_uri: 'http://localhost:3000/auth/github/callback' }),
      envWithGithub(),
    )
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'github_auth_failed' })
  })

  it('200 issues a session for the GitHub user, and reuses the same user on re-login', async () => {
    const env = envWithGithub()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).includes('login/oauth/access_token')
          ? jsonRes({ access_token: 'gho_x' })
          : jsonRes({ id: 42, login: 'octocat' }),
      ),
    )

    const res = await handleGithubExchange(
      req({ code: 'good', redirect_uri: 'http://localhost:3000/auth/github/callback' }),
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.ok).toBe(true)
    expect(body.github).toEqual({ id: 42, login: 'octocat' })
    expect(typeof body.session_token).toBe('string')

    const user = await getUserFromSessionToken(env, body.session_token as string)
    expect(user?.user_id).toBe(body.user_id)

    const res2 = await handleGithubExchange(
      req({ code: 'good2', redirect_uri: 'http://localhost:3000/auth/github/callback' }),
      env,
    )
    const body2 = (await res2.json()) as Record<string, unknown>
    expect(body2.user_id).toBe(body.user_id) // same GitHub id → same user
  })
})
