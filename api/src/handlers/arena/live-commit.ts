// POST /v1/arena/live/<id>/commit — Bearer auth.
// Body : { anon_id, move_id }
// Lock the chosen move for the current turn. Once both sides have committed,
// the worker resolves the turn server-side and clears pending_action on each
// side. Idempotent re-commit of the same move_id is a no-op (returns current
// state) ; switching is forbidden once committed (would let players spy on
// the opponent then switch on retry).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import { getLiveBattle, putLiveBattle } from '../../lib/kv'
import { hasExpired, liveBattleView, lookupMoveForSide, resolveLiveTurn } from '../../lib/live-battle'
import {
  ANON_ID_RE,
  BATTLE_ID_RE,
  type BattleSide,
  type LiveBattleSide,
} from '../../types'

export async function handleLiveCommit(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  const m = pathname.match(/^\/v1\/arena\/live\/([a-f0-9]{16,32})\/commit$/)
  if (!m) return jsonResp({ error: 'invalid_path' }, 400)
  const battleId = m[1]!
  if (!BATTLE_ID_RE.test(battleId)) return jsonResp({ error: 'invalid_battle_id' }, 400)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') return jsonResp({ error: 'body_required' }, 400)
  const b = body as { anon_id?: string; move_id?: string }
  if (typeof b.anon_id !== 'string' || !ANON_ID_RE.test(b.anon_id)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }
  if (typeof b.move_id !== 'string' || b.move_id.length === 0 || b.move_id.length > 64) {
    return jsonResp({ error: 'invalid_move_id' }, 400)
  }

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const record = await getLiveBattle(env, battleId)
  if (!record) return jsonResp({ error: 'not_found' }, 404)

  if (hasExpired(record)) {
    record.state = 'expired'
    record.reason = 'expired'
    await putLiveBattle(env, record)
    return jsonResp({ error: 'expired' }, 409)
  }

  if (record.state !== 'active') {
    return jsonResp({ error: 'invalid_state', state: record.state }, 409)
  }
  // After accept, defender must have a snapshot.
  if (!('snapshot' in record.defender)) {
    return jsonResp({ error: 'invalid_state', state: record.state }, 409)
  }

  // Identify which side this commit is for.
  let side: BattleSide | null = null
  let actor: LiveBattleSide
  if (b.anon_id === record.challenger.anon_id) {
    side = 'challenger'
    actor = record.challenger
  } else if (b.anon_id === record.defender.anon_id) {
    side = 'defender'
    actor = record.defender
  } else {
    return jsonResp({ error: 'not_a_participant' }, 403)
  }

  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, actor.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  // Validate the move is in this actor's stage pool.
  const move = lookupMoveForSide(actor, b.move_id)
  if (!move) {
    return jsonResp({ error: 'invalid_move', move_id: b.move_id }, 400)
  }

  if (actor.pending_action !== null) {
    if (actor.pending_action === b.move_id) {
      // Idempotent : same move re-submitted, return current state.
      return jsonResp({ ok: true, ...liveBattleView(record) })
    }
    // Refuse to swap — would let a player observe the opponent's commit and
    // then change their move. The game is "commit once per turn".
    return jsonResp({ error: 'already_committed' }, 409)
  }

  actor.pending_action = b.move_id
  record.last_activity_at = new Date().toISOString()

  // If both committed, resolve the turn now.
  const otherCommitted =
    (side === 'challenger' && record.defender.pending_action !== null) ||
    (side === 'defender' && record.challenger.pending_action !== null)
  if (otherCommitted) {
    resolveLiveTurn(record)
  }

  await putLiveBattle(env, record)
  return jsonResp({ ok: true, ...liveBattleView(record) })
}
