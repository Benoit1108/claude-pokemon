// POST /v1/auth/github/cli-session  { access_token }
//
// The CLI runs the GitHub *device flow* itself (public client_id, no secret —
// device flow is a public-client grant) to obtain a GitHub access token, then
// posts it here. The Worker resolves the GitHub user and mints an opaque
// session — same identity model as the web flow, no client_secret involved.
//
// 400 invalid_body / missing_token
// 401 github_auth_failed   — the access token doesn't resolve to a GitHub user

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { createSession, findOrCreateUserByIdentity } from '../../lib/auth'
import { fetchGithubUser } from '../../lib/github'

export async function handleGithubCliSession(request: Request, env: Env): Promise<Response> {
  let body: { access_token?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonResp({ error: 'invalid_body' }, 400)
  }
  const accessToken = body.access_token
  if (typeof accessToken !== 'string' || accessToken.length === 0 || accessToken.length > 512) {
    return jsonResp({ error: 'missing_token' }, 400)
  }

  let github
  try {
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
