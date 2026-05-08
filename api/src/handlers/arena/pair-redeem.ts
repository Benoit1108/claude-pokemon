// POST /v1/arena/pair/redeem — no auth.
// Body : { code }
// One-shot redemption of a pairing code issued by /pair/init. Returns the
// trainer's anon_id and arena_secret. Codes are consumed on first redeem ;
// second redeem 404s.
//
// Atomicity (Sprint 2.13 — Code review C2) :
//   KV has no compare-and-swap. A naive "get → delete → return" lets two
//   concurrent redeemers both pass the get and both return the secret. We
//   mitigate via a claim-and-verify dance :
//     1. read record (404 if missing or already consumed_by anyone)
//     2. write record back with consumed_by = freshly-generated token
//     3. re-read record ; if consumed_by !== our token, we lost the race
//     4. only if our token wins, return the secret
//   Two redeemers will both write step 2, but only one wins step 3 (last
//   writer's token sticks). Race window ≈ KV write propagation, much smaller
//   than the original "both get + both return" window. Not bulletproof
//   (regional inconsistency could still let both win briefly) but good
//   enough given the 5-min TTL and one-shot semantics.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { deletePairRecord, getPairRecord, putPairRecord } from '../../lib/kv'
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
  if (record.consumed_by) {
    return jsonResp({ error: 'code_not_found' }, 404)
  }

  // Stake our claim. crypto.randomUUID is unique per redeemer ; whoever's
  // token is observable in the post-write read wins.
  const myToken = crypto.randomUUID()
  record.consumed_by = myToken
  await putPairRecord(env, b.code, record)

  const verify = await getPairRecord(env, b.code)
  if (!verify || verify.consumed_by !== myToken) {
    // Another redeemer wrote between our claim and verify and overwrote us.
    return jsonResp({ error: 'code_not_found' }, 404)
  }

  // We won. Schedule the delete (best-effort — TTL also cleans up).
  await deletePairRecord(env, b.code)

  return jsonResp({
    ok: true,
    anon_id: record.anon_id,
    arena_secret: record.arena_secret,
  })
}
