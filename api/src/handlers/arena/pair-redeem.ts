// POST /v1/arena/pair/redeem — no auth.
// Body : { code }
// Reads + DELETES the pairing record. Returns the trainer's anon_id and
// arena_secret to the redeemer (the browser). Codes are one-shot : second
// redeem of the same code 404s.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { deletePairRecord, getPairRecord } from '../../lib/kv'
import { PAIR_CODE_RE } from '../../types'

export async function handlePairRedeem(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') return jsonResp({ error: 'body_required' }, 400)
  const b = body as { code?: unknown }
  if (typeof b.code !== 'string' || !PAIR_CODE_RE.test(b.code)) {
    return jsonResp({ error: 'invalid_code' }, 400)
  }

  const record = await getPairRecord(env, b.code)
  if (!record) {
    // 404 covers both "never existed" and "expired/already redeemed" — we
    // don't differentiate to avoid leaking valid-but-spent codes.
    return jsonResp({ error: 'code_not_found' }, 404)
  }

  // Consume immediately so a parallel redeem can't race us.
  await deletePairRecord(env, b.code)

  return jsonResp({
    ok: true,
    anon_id: record.anon_id,
    arena_secret: record.arena_secret,
  })
}
