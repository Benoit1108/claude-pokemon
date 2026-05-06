// DELETE /v1/arena/disable?anon_id=X — Bearer auth.
// Removes the trainer from the arena pool (preserves stored battles for replay).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { ANON_ID_RE } from '../../types'
import { deleteArena, getArena } from '../../lib/kv'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'

export async function handleArenaDisable(request: Request, url: URL, env: Env): Promise<Response> {
  const anonId = url.searchParams.get('anon_id') || ''
  if (!ANON_ID_RE.test(anonId)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const record = await getArena(env, anonId)
  if (!record) return jsonResp({ error: 'not_enabled' }, 404)

  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, record.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  await deleteArena(env, anonId)
  return jsonResp({ ok: true })
}
