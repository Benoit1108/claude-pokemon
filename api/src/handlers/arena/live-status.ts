// GET /v1/arena/live/<id> — public read of live battle state.
// No auth : both players (and spectators, eventually) can poll this. The
// view strips out secret_hash + the opponent's pending move id so a player
// can't infer their opponent's move before reveal.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { getLiveBattle, putLiveBattle } from '../../lib/kv'
import { hasExpired, liveBattleView } from '../../lib/live-battle'
import { BATTLE_ID_RE } from '../../types'

export async function handleLiveStatus(pathname: string, env: Env): Promise<Response> {
  const id = pathname.replace('/v1/arena/live/', '')
  if (!BATTLE_ID_RE.test(id)) return jsonResp({ error: 'invalid_battle_id' }, 400)

  const record = await getLiveBattle(env, id)
  if (!record) return jsonResp({ error: 'not_found' }, 404)

  // Lazy expiry : if a battle was abandoned mid-flight (one party never came
  // back), surface that to the polling client by transitioning state on read.
  if (hasExpired(record)) {
    record.state = 'expired'
    record.reason = 'expired'
    await putLiveBattle(env, record)
  }

  return jsonResp(liveBattleView(record))
}
