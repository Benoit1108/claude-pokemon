// POST /v1/arena/challenge — Bearer auth. Body: { challenger_anon_id, defender_anon_id }
// Resolves the battle deterministically + persists the result. Returns full BattleResult.
//
// Cooldown : 1 hour between challenges per challenger (see lib/kv).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import {
  ARENA_CHALLENGE_COOLDOWN_S,
  getArena,
  getArenaChallengeCooldown,
  putBattle,
  setArenaChallengeCooldown,
} from '../../lib/kv'
import {
  constantTimeEqual,
  extractBearer,
  generateBattleId,
  randomSeed,
  sha256Hex,
} from '../../lib/arena'
import { resolveBattle } from '../../lib/battle'
import { ANON_ID_RE } from '../../types'

export async function handleArenaChallenge(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }

  if (!body || typeof body !== 'object') {
    return jsonResp({ error: 'body must be object' }, 400)
  }
  const b = body as { challenger_anon_id?: string; defender_anon_id?: string }
  const challengerId = b.challenger_anon_id || ''
  const defenderId = b.defender_anon_id || ''
  if (!ANON_ID_RE.test(challengerId)) {
    return jsonResp({ error: 'invalid_challenger_anon_id' }, 400)
  }
  if (!ANON_ID_RE.test(defenderId)) {
    return jsonResp({ error: 'invalid_defender_anon_id' }, 400)
  }
  if (challengerId === defenderId) {
    return jsonResp({ error: 'cannot_challenge_self' }, 400)
  }

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const challenger = await getArena(env, challengerId)
  if (!challenger) return jsonResp({ error: 'challenger_not_enabled' }, 403)

  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, challenger.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  const defender = await getArena(env, defenderId)
  if (!defender) return jsonResp({ error: 'defender_not_enabled' }, 404)

  const last = await getArenaChallengeCooldown(env, challengerId)
  if (last !== null) {
    const secsLeft = Math.ceil(ARENA_CHALLENGE_COOLDOWN_S - (Date.now() / 1000 - last))
    return jsonResp(
      {
        error: 'rate_limited',
        cooldown_remaining_s: Math.max(0, secsLeft),
      },
      429,
    )
  }

  const seed = randomSeed()
  const createdAt = new Date().toISOString()
  const result = resolveBattle({
    challenger: challenger.team_snapshot,
    defender: defender.team_snapshot,
    seed,
    createdAt,
  })
  result.battle_id = generateBattleId()

  await putBattle(env, result)
  await setArenaChallengeCooldown(env, challengerId)

  return jsonResp({ ok: true, battle: result })
}
