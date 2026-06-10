// POST /v1/auth/github/exchange  { code, redirect_uri }
//
// The web does the GitHub redirect dance itself (public client_id, CSRF `state`
// verified client-side), then posts the one-time `code` here. The Worker holds
// the client_secret, exchanges the code server-side, resolves the GitHub user to
// our stable user (findOrCreateUserByIdentity), and issues an opaque session.
//
// 400 invalid_body / missing_code / missing_redirect_uri
// 503 github_oauth_unconfigured  — GITHUB_CLIENT_ID/SECRET not set on the Worker
// 401 github_auth_failed         — code exchange or user fetch rejected

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { createSession, findOrCreateUserByIdentity } from '../../lib/auth'
import { exchangeCodeForAccessToken, fetchGithubUser } from '../../lib/github'

export async function handleGithubExchange(request: Request, env: Env): Promise<Response> {
  let body: { code?: unknown; redirect_uri?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonResp({ error: 'invalid_body' }, 400)
  }

  const code = body.code
  const redirectUri = body.redirect_uri
  if (typeof code !== 'string' || code.length === 0) {
    return jsonResp({ error: 'missing_code' }, 400)
  }
  if (typeof redirectUri !== 'string' || redirectUri.length === 0) {
    return jsonResp({ error: 'missing_redirect_uri' }, 400)
  }
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return jsonResp({ error: 'github_oauth_unconfigured' }, 503)
  }

  let github
  try {
    const accessToken = await exchangeCodeForAccessToken(env, code, redirectUri)
    github = await fetchGithubUser(accessToken)
  } catch {
    return jsonResp({ error: 'github_auth_failed' }, 401)
  }

  const now = new Date().toISOString()
  const user = await findOrCreateUserByIdentity(
    env,
    {
      provider: 'github',
      externalId: String(github.id),
      github: { id: github.id, login: github.login },
    },
    now,
  )
  const sessionToken = await createSession(env, user.user_id, now)

  return jsonResp({
    ok: true,
    session_token: sessionToken,
    user_id: user.user_id,
    github: user.github,
  })
}
