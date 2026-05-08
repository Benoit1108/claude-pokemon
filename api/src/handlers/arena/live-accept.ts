// POST /v1/arena/live/<id>/accept — Bearer auth.
// The defender accepts a pending invite. We verify it matches the defender
// stored on the record, snapshot their team, and flip state → 'active'.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import { getArena, getLiveBattle, putLiveBattle } from '../../lib/kv'
import { BATTLE_ID_RE, type LiveBattleRecord } from '../../types'

export async function handleLiveAccept(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  const m = pathname.match(/^\/v1\/arena\/live\/([a-f0-9]{16,32})\/accept$/)
  if (!m) return jsonResp({ error: 'invalid_path' }, 400)
  const battleId = m[1]!
  if (!BATTLE_ID_RE.test(battleId)) return jsonResp({ error: 'invalid_battle_id' }, 400)

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const record = await getLiveBattle(env, battleId)
  if (!record) return jsonResp({ error: 'not_found' }, 404)
  if (record.state !== 'pending') {
    return jsonResp({ error: 'invalid_state', state: record.state }, 409)
  }

  const defender = await getArena(env, record.defender.anon_id)
  if (!defender) return jsonResp({ error: 'defender_not_enabled' }, 403)

  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, defender.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  const defenderHp = 50 + defender.team_snapshot.level * 2
  const now = new Date().toISOString()
  const updated: LiveBattleRecord = {
    ...record,
    state: 'active',
    defender: {
      anon_id: defender.anon_id,
      secret_hash: defender.secret_hash,
      snapshot: defender.team_snapshot,
      hp: defenderHp,
      pending_action: null,
    },
    turn_no: 1,
    last_activity_at: now,
  }
  await putLiveBattle(env, updated)

  return jsonResp({ ok: true, state: 'active', turn_no: 1 })
}
