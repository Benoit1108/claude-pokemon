// POST /v1/arena/live/<id>/forfeit — Bearer auth.
// Either player may forfeit. The other side wins. Idempotent — re-forfeit
// of a finished/abandoned battle is a no-op (returns current state).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import { getLiveBattle, putLiveBattle } from '../../lib/kv'
import { liveBattleView } from '../../lib/live-battle'
import { BATTLE_ID_RE, type BattleSide, type LiveBattleRecord } from '../../types'

export async function handleLiveForfeit(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  const m = pathname.match(/^\/v1\/arena\/live\/([a-f0-9]{16,32})\/forfeit$/)
  if (!m) return jsonResp({ error: 'invalid_path' }, 400)
  const battleId = m[1]!
  if (!BATTLE_ID_RE.test(battleId)) return jsonResp({ error: 'invalid_battle_id' }, 400)

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const record = await getLiveBattle(env, battleId)
  if (!record) return jsonResp({ error: 'not_found' }, 404)

  if (record.state === 'finished' || record.state === 'abandoned' || record.state === 'expired') {
    // Idempotent — no need to bump activity or change state.
    return jsonResp({ ok: true, ...liveBattleView(record) })
  }

  // Identify which side the bearer belongs to. Constant-time comparison both
  // ways so we don't leak which secret matched on a wrong-secret attempt.
  const incoming = await sha256Hex(bearer)
  const challengerMatch = constantTimeEqual(incoming, record.challenger.secret_hash)

  let defenderMatch = false
  if ('secret_hash' in record.defender) {
    defenderMatch = constantTimeEqual(incoming, record.defender.secret_hash)
  }

  if (!challengerMatch && !defenderMatch) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  const forfeitSide: BattleSide = challengerMatch ? 'challenger' : 'defender'
  const winner: BattleSide = forfeitSide === 'challenger' ? 'defender' : 'challenger'

  const updated: LiveBattleRecord = {
    ...record,
    state: 'abandoned',
    winner: 'snapshot' in record.defender ? winner : null, // pre-accept invite : no winner
    reason: 'forfeit',
    forfeit_by: forfeitSide,
    last_activity_at: new Date().toISOString(),
  }
  await putLiveBattle(env, updated)
  return jsonResp({ ok: true, ...liveBattleView(updated) })
}
