// POST /v1/auth/link-anon — Bearer (session token). Body { anon_id, arena_secret }.
//
// Links a legacy anon account (CLI / pre-auth web) to the authenticated user
// (ADR-010, link-never-destroy). Ownership of the anon account is PROVEN by the
// arena_secret (same hash check as /v1/arena/whoami) before linking — a session
// alone can't claim an arbitrary anon_id.
//
// 401 missing_bearer / invalid_session / invalid_secret
// 400 invalid_body / invalid_anon_id
// 404 anon_not_found
// 409 already_linked   — anon_id is already linked to a different user

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import { getUserFromSessionToken, linkAnonToUser } from '../../lib/auth'
import { getArena } from '../../lib/kv'
import { ANON_ID_RE } from '../../types'

export async function handleLinkAnon(request: Request, env: Env): Promise<Response> {
  const token = extractBearer(request)
  if (!token) return jsonResp({ error: 'missing_bearer' }, 401)
  const user = await getUserFromSessionToken(env, token)
  if (!user) return jsonResp({ error: 'invalid_session' }, 401)

  let body: { anon_id?: unknown; arena_secret?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return jsonResp({ error: 'invalid_body' }, 400)
  }
  const anonId = body.anon_id
  const arenaSecret = body.arena_secret
  if (typeof anonId !== 'string' || !ANON_ID_RE.test(anonId)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }
  if (typeof arenaSecret !== 'string') {
    return jsonResp({ error: 'invalid_body' }, 400)
  }

  const arena = await getArena(env, anonId)
  if (!arena) return jsonResp({ error: 'anon_not_found' }, 404)

  const incoming = await sha256Hex(arenaSecret)
  if (!constantTimeEqual(incoming, arena.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  let updated
  try {
    updated = await linkAnonToUser(env, user, anonId, new Date().toISOString())
  } catch {
    return jsonResp({ error: 'already_linked' }, 409)
  }

  return jsonResp({ ok: true, user_id: updated.user_id, linked_anon_ids: updated.linked_anon_ids })
}
