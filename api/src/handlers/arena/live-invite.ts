// POST /v1/arena/live/invite — Bearer auth.
// Body : { challenger_anon_id, defender_anon_id }
// Creates a LiveBattleRecord in 'pending' state. Defender accepts via
// /accept ; until then, only the anon_id is recorded on the defender side.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import {
  generateBattleId,
  constantTimeEqual,
  extractBearer,
  sha256Hex,
} from '../../lib/arena'
import {
  getArena,
  getLiveInviteCooldown,
  putLiveBattle,
  setLiveInviteCooldown,
} from '../../lib/kv'
import {
  ANON_ID_RE,
  LIVE_BATTLE_INVITE_COOLDOWN_S,
  type LiveBattleRecord,
} from '../../types'

export async function handleLiveInvite(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') return jsonResp({ error: 'body_required' }, 400)
  const b = body as { challenger_anon_id?: string; defender_anon_id?: string }
  const challengerId = b.challenger_anon_id || ''
  const defenderId = b.defender_anon_id || ''
  if (!ANON_ID_RE.test(challengerId)) return jsonResp({ error: 'invalid_challenger_anon_id' }, 400)
  if (!ANON_ID_RE.test(defenderId)) return jsonResp({ error: 'invalid_defender_anon_id' }, 400)
  if (challengerId === defenderId) return jsonResp({ error: 'cannot_challenge_self' }, 400)

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const challenger = await getArena(env, challengerId)
  if (!challenger) return jsonResp({ error: 'challenger_not_enabled' }, 403)
  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, challenger.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  // Sprint 2.13 (Q1) — return 404 (not 403) when the defender doesn't exist
  // OR isn't arena-enabled. Differentiating would let an authed challenger
  // probe arbitrary anon_ids and learn which trainers are enabled.
  const defender = await getArena(env, defenderId)
  if (!defender) return jsonResp({ error: 'defender_not_found' }, 404)

  // Anti-spam : 30s cooldown between invites per challenger. Stricter cooldowns
  // belong on /commit once we have full turn resolution (Sprint 2.10b).
  const lastInvite = await getLiveInviteCooldown(env, challengerId)
  if (lastInvite !== null) {
    const secsLeft = Math.ceil(LIVE_BATTLE_INVITE_COOLDOWN_S - (Date.now() / 1000 - lastInvite))
    return jsonResp(
      { error: 'rate_limited', cooldown_remaining_s: Math.max(0, secsLeft) },
      429,
    )
  }

  const battleId = generateBattleId()
  const now = new Date().toISOString()
  const challengerHp = 50 + challenger.team_snapshot.level * 2 // mirrors maxHp(level, false)

  const record: LiveBattleRecord = {
    battle_id: battleId,
    state: 'pending',
    challenger: {
      anon_id: challengerId,
      secret_hash: challenger.secret_hash,
      snapshot: challenger.team_snapshot,
      hp: challengerHp,
      pending_action: null,
    },
    defender: { anon_id: defenderId },
    turn_no: 0,
    turn_log: [],
    winner: null,
    reason: null,
    created_at: now,
    last_activity_at: now,
    forfeit_by: null,
  }
  await putLiveBattle(env, record)
  await setLiveInviteCooldown(env, challengerId)

  return jsonResp({ ok: true, battle_id: battleId, state: 'pending' })
}
