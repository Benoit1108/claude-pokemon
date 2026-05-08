// POST /v1/arena/pair/init — Bearer auth.
// Body : { anon_id }
// Issues a one-shot pairing code that lets a browser claim this trainer's
// arena_secret. The Bearer header IS the secret — we hash + compare against
// the stored secret_hash. The plaintext is then stored in KV under
// pair:<code> for at most PAIR_CODE_TTL_S seconds (5 min) and consumed on
// first redeem.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import {
  constantTimeEqual,
  extractBearer,
  generatePairCode,
  sha256Hex,
} from '../../lib/arena'
import { getArena, putPairRecord } from '../../lib/kv'
import { ANON_ID_RE, PAIR_CODE_TTL_S, type PairRecord } from '../../types'

export async function handlePairInit(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') return jsonResp({ error: 'body_required' }, 400)
  const b = body as { anon_id?: string }
  if (typeof b.anon_id !== 'string' || !ANON_ID_RE.test(b.anon_id)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const arena = await getArena(env, b.anon_id)
  if (!arena) return jsonResp({ error: 'arena_not_enabled' }, 403)

  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, arena.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  // Generate a fresh, non-colliding code. With 31^6 = ~887M codespace and a
  // 5min TTL this collision is essentially impossible, but we belt-and-braces
  // by retrying on the off chance — caps at 4 attempts.
  let code = ''
  for (let attempt = 0; attempt < 4; attempt++) {
    code = generatePairCode()
    const existing = await env.STATS.get(`pair:${code}`)
    if (!existing) break
    code = ''
  }
  if (!code) return jsonResp({ error: 'code_collision' }, 503)

  const now = new Date()
  const expires = new Date(now.getTime() + PAIR_CODE_TTL_S * 1000)
  const record: PairRecord = {
    anon_id: b.anon_id,
    arena_secret: bearer,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  }
  await putPairRecord(env, code, record)

  return jsonResp({
    ok: true,
    code,
    expires_at: record.expires_at,
    ttl_s: PAIR_CODE_TTL_S,
  })
}
