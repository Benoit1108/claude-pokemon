// GET /v1/auth/session — Bearer (opaque session token) auth. Returns the
// authenticated user, or 401. This is the "whoami" the web/CLI call after login
// to confirm + hydrate the session.
//
// 401 missing_bearer    — no Authorization: Bearer <token>
// 401 invalid_session   — token doesn't resolve to a live session

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { extractBearer } from '../../lib/arena'
import { getUserFromSessionToken } from '../../lib/auth'

export async function handleAuthSession(request: Request, env: Env): Promise<Response> {
  const token = extractBearer(request)
  if (!token) return jsonResp({ error: 'missing_bearer' }, 401)

  const user = await getUserFromSessionToken(env, token)
  if (!user) return jsonResp({ error: 'invalid_session' }, 401)

  return jsonResp({
    ok: true,
    user_id: user.user_id,
    github: user.github,
    email: user.email,
    display_name: user.display_name,
    linked_anon_ids: user.linked_anon_ids,
  })
}
