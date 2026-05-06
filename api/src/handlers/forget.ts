// DELETE /v1/forget?anon_id=<id>  → purge a player's record (GDPR)

import type { Env } from '../env.d'
import { jsonResp } from '../lib/http'
import { deleteCooldown, deleteStats } from '../lib/kv'
import { ANON_ID_RE } from '../types'

export async function handleForget(url: URL, env: Env): Promise<Response> {
  const anon_id = url.searchParams.get('anon_id')
  if (!anon_id || !ANON_ID_RE.test(anon_id)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }
  await deleteStats(env, anon_id)
  await deleteCooldown(env, anon_id)
  return jsonResp({ ok: true, forgotten: anon_id })
}
