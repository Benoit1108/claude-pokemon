// POST /v1/arena/live/<id>/commit — Bearer auth.
// Body : { anon_id, move_id }
// Lock the chosen move for the current turn. Once both sides have committed,
// the worker resolves the turn server-side and clears pending_action on each
// side. Idempotent re-commit of the same move_id is a no-op (returns current
// state) ; switching is forbidden once committed (would let players spy on
// the opponent then switch on retry).
//
// Concurrency model (Sprint 2.13 — Code review C1) :
//   Cloudflare KV has no compare-and-swap. Two simultaneous commits from
//   opposite sides could naively read (a:null, b:null), each compute their
//   own update locally, then race-write — last write wins, the other side's
//   commit is silently lost, the turn never resolves and the battle hangs.
//   We mitigate with a bounded read-modify-verify retry loop : after writing,
//   we re-read and check our pending_action persisted. If not (we lost the
//   race), we retry from a fresh read up to LIVE_COMMIT_MAX_RETRIES times.
//   resolveLiveTurn is deterministic from (battle_id, turn_no) so even if
//   both sides resolve in parallel they produce the same turn_log entries —
//   last write wins with identical content, which is fine.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import { getLiveBattle, putLiveBattle } from '../../lib/kv'
import {
  hasExpired,
  liveBattleView,
  lookupMoveForSide,
  resolveLiveTurn,
} from '../../lib/live-battle'
import {
  ANON_ID_RE,
  BATTLE_ID_RE,
  type BattleSide,
  type LiveBattleRecord,
  type LiveBattleSide,
} from '../../types'

const LIVE_COMMIT_MAX_RETRIES = 3

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

  // The Bearer hash is constant across retries — compute once.
  const incomingHash = await sha256Hex(bearer)

  for (let attempt = 0; attempt < LIVE_COMMIT_MAX_RETRIES; attempt++) {
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
    if (!('snapshot' in record.defender)) {
      return jsonResp({ error: 'invalid_state', state: record.state }, 409)
    }

    let side: BattleSide
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

    if (!constantTimeEqual(incomingHash, actor.secret_hash)) {
      return jsonResp({ error: 'invalid_secret' }, 401)
    }

    const move = lookupMoveForSide(actor, b.move_id)
    if (!move) {
      return jsonResp({ error: 'invalid_move', move_id: b.move_id }, 400)
    }

    if (actor.pending_action !== null) {
      if (actor.pending_action === b.move_id) {
        return jsonResp({ ok: true, ...liveBattleView(record) })
      }
      return jsonResp({ error: 'already_committed' }, 409)
    }

    actor.pending_action = b.move_id
    record.last_activity_at = new Date().toISOString()
    const turnAtRead = record.turn_no

    const otherCommitted =
      (side === 'challenger' && record.defender.pending_action !== null) ||
      (side === 'defender' && record.challenger.pending_action !== null)
    if (otherCommitted) {
      resolveLiveTurn(record)
    }

    await putLiveBattle(env, record)

    // Verify-after-write : re-read and check our intended state stuck. If
    // the opponent wrote in our compute window, their write may have
    // overwritten ours with a stale view of our pending_action. The retry
    // re-reads and re-applies on top of the new ground truth.
    const verify = await getLiveBattle(env, battleId)
    if (!verify) return jsonResp({ error: 'not_found' }, 404)

    if (verifyCommitLanded(verify, side, b.move_id, turnAtRead)) {
      return jsonResp({ ok: true, ...liveBattleView(verify) })
    }
    // Fallthrough → another iteration of the retry loop.
  }

  // We retried LIVE_COMMIT_MAX_RETRIES times and still couldn't observe our
  // commit. Surface a 503 so the client retries from scratch — this should
  // never happen under normal load.
  return jsonResp({ error: 'commit_race_lost' }, 503)
}

/**
 * Returns true iff our commit appears to have stuck. Two valid outcomes :
 *   1. The turn advanced (turn_no > turnAtRead) — both sides committed and
 *      the resolver ran ; our move is in the turn_log.
 *   2. Our pending_action is still set on this side at the same turn.
 */
function verifyCommitLanded(
  record: LiveBattleRecord,
  side: BattleSide,
  moveId: string,
  turnAtRead: number,
): boolean {
  if (record.turn_no > turnAtRead) return true
  const actorView = side === 'challenger' ? record.challenger : record.defender
  if (!('pending_action' in actorView)) return false
  return actorView.pending_action === moveId
}
