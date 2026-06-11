// POST /v1/auth/logout — Bearer (session token). Revokes the session
// server-side by deleting session:<hash> (the whole point of opaque tokens).
// Idempotent + no info leak : always 200, even for a missing/unknown token.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { extractBearer, sha256Hex } from '../../lib/arena'
import { deleteSession } from '../../lib/kv'

export async function handleAuthLogout(request: Request, env: Env): Promise<Response> {
  const token = extractBearer(request)
  if (token) {
    await deleteSession(env, await sha256Hex(token))
  }
  return jsonResp({ ok: true })
}
