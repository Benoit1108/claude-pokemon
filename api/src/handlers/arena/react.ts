// POST /v1/arena/battle/<id>/react
// Body : { anon_id, reaction }
// Adds (or changes) a vote for the battle's emoji reactions. Bounded set
// (clap/fire/party/lol/tear/love) — no free text. Rate-limit = 1 vote per
// anon_id per battle ; sending a different reaction REPLACES the previous
// one (counts adjusted accordingly). No Bearer auth needed — reactions are
// public read/write but bounded enough that abuse cost is low.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { getBattle, getBattleReactions, putBattleReactions } from '../../lib/kv'
import { ANON_ID_RE, BATTLE_ID_RE, REACTION_KEYS, type ReactionKey } from '../../types'

export async function handleArenaReact(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  // Path : /v1/arena/battle/<id>/react
  const m = pathname.match(/^\/v1\/arena\/battle\/([a-f0-9]{16,32})\/react$/)
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
  const b = body as { anon_id?: unknown; reaction?: unknown }

  if (typeof b.anon_id !== 'string' || !ANON_ID_RE.test(b.anon_id)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }
  if (
    typeof b.reaction !== 'string' ||
    !(REACTION_KEYS as readonly string[]).includes(b.reaction)
  ) {
    return jsonResp({ error: 'invalid_reaction', allowed: REACTION_KEYS }, 400)
  }
  const anonId = b.anon_id
  const reaction = b.reaction as ReactionKey

  // Battle must exist (404 silently otherwise — don't reveal valid IDs).
  const battle = await getBattle(env, battleId)
  if (!battle) return jsonResp({ error: 'battle_not_found' }, 404)

  const reactions = await getBattleReactions(env, battleId)
  const previous = reactions.voters[anonId]
  if (previous === reaction) {
    // Idempotent : no-op return current state.
    return jsonResp({ ok: true, reactions: reactions.counts, your_reaction: reaction })
  }
  // If user had a previous reaction, decrement it (clamp at 0 to be safe).
  if (previous && reactions.counts[previous] !== undefined) {
    reactions.counts[previous] = Math.max(0, reactions.counts[previous] - 1)
  }
  reactions.counts[reaction] = (reactions.counts[reaction] ?? 0) + 1
  reactions.voters[anonId] = reaction
  await putBattleReactions(env, battleId, reactions)

  return jsonResp({ ok: true, reactions: reactions.counts, your_reaction: reaction })
}
