// DELETE /v1/forget?anon_id=<id>  → purge a player's record (GDPR).
//
// Authenticated: anon_id is public (it appears on the leaderboard), so the
// delete must prove ownership via the arena_secret — same credential as every
// other mutating route. A submit-only record that never enabled the arena has
// no secret to prove ownership and returns 403: it can't be force-deleted
// remotely (it holds only public, anonymous stats keyed by a random anon_id;
// it otherwise expires with its KV TTL). A regulator-facing erase, if ever
// needed, would be an out-of-band admin path — not this public endpoint.

import type { Env } from '../env.d'
import { jsonResp } from '../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../lib/arena'
import { deleteCooldown, deleteStats, getArena } from '../lib/kv'
import { ANON_ID_RE } from '../types'

export async function handleForget(request: Request, url: URL, env: Env): Promise<Response> {
  const anon_id = url.searchParams.get('anon_id')
  if (!anon_id || !ANON_ID_RE.test(anon_id)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)
  const arena = await getArena(env, anon_id)
  if (!arena) return jsonResp({ error: 'trainer_not_enabled' }, 403)
  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, arena.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  await deleteStats(env, anon_id)
  await deleteCooldown(env, anon_id)
  return jsonResp({ ok: true, forgotten: anon_id })
}
