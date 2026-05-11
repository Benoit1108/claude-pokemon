// POST /v1/zone/<zone_id>/flee — Bearer auth.
// Body : { anon_id }
//
// Sprint 4.6 — discard the trainer's pending wild encounter without
// engaging in battle. Mirrors canon's "RUN" button : no XP, no risk, but
// the species still counts as "seen" in the pokédex (recorded at explore
// time, not here). Idempotent : fleeing nothing is a 200 no-op.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import { deletePendingEncounter, getArena, getPendingEncounter } from '../../lib/kv'
import { ANON_ID_RE } from '../../types'

export async function handleZoneFlee(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  const m = pathname.match(/^\/v1\/zone\/([a-z][a-z0-9-]{1,32})\/flee$/)
  if (!m) return jsonResp({ error: 'invalid_path' }, 400)
  // zone_id is in the path mostly for symmetry with /explore + /fight ;
  // we don't actually use it for matching (the encounter is per-trainer).

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') return jsonResp({ error: 'body_required' }, 400)
  const b = body as { anon_id?: string }
  if (typeof b.anon_id !== 'string' || !ANON_ID_RE.test(b.anon_id)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }
  const anonId = b.anon_id

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const arena = await getArena(env, anonId)
  if (!arena) return jsonResp({ error: 'arena_not_enabled' }, 403)
  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, arena.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  const encounter = await getPendingEncounter(env, anonId)
  await deletePendingEncounter(env, anonId)
  return jsonResp({ ok: true, fled: encounter !== null })
}
