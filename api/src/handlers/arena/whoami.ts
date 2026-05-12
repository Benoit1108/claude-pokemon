// GET /v1/arena/whoami?anon_id=<id> — Bearer auth. Validates that the supplied
// {anon_id, arena_secret} pair matches a stored ArenaRecord. Used by the web
// /login page to verify pasted credentials before persisting them to
// localStorage (Sprint 5 recovery-key flow). Returns the public team snapshot
// + origin/timestamps on success.
//
// 400 invalid_anon_id   — query param missing or malformed
// 401 missing_bearer    — no Authorization header
// 401 invalid_secret    — anon_id exists but secret hash mismatches
// 404 not_found         — no ArenaRecord for this anon_id

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { getArena } from '../../lib/kv'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import { ANON_ID_RE } from '../../types'

export async function handleArenaWhoami(request: Request, url: URL, env: Env): Promise<Response> {
  const anonId = url.searchParams.get('anon_id') ?? ''
  if (!ANON_ID_RE.test(anonId)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const existing = await getArena(env, anonId)
  if (!existing) return jsonResp({ error: 'not_found' }, 404)

  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, existing.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  return jsonResp({
    ok: true,
    anon_id: existing.anon_id,
    enabled_at: existing.enabled_at,
    updated_at: existing.updated_at,
    origin: existing.origin,
    team_snapshot: existing.team_snapshot,
  })
}
