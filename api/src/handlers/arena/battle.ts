// GET /v1/arena/battle/:id — public read of a persisted battle record
// + its aggregated reaction counts (Sprint 2.8b).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { BATTLE_ID_RE } from '../../types'
import { getBattle, getBattleReactions } from '../../lib/kv'

export async function handleArenaBattle(pathname: string, env: Env): Promise<Response> {
  const id = pathname.replace('/v1/arena/battle/', '')
  if (!BATTLE_ID_RE.test(id)) {
    return jsonResp({ error: 'invalid_battle_id' }, 400)
  }
  const battle = await getBattle(env, id)
  if (!battle) return jsonResp({ error: 'not_found' }, 404)
  const reactions = await getBattleReactions(env, id)
  return jsonResp({ battle, reactions: reactions.counts })
}
