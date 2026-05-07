// POST /v1/submit  → submit stats payload (rate-limited 24h per anon_id)

import type { Env } from '../env.d'
import { jsonResp } from '../lib/http'
import { validateSubmit } from '../lib/validation'
import { getCooldown, putStats, setCooldown } from '../lib/kv'
import { SUBMIT_COOLDOWN_S, type SubmitPayload, type KVRecord } from '../types'

export async function handleSubmit(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }

  const errs = validateSubmit(body)
  if (errs.length) return jsonResp({ error: 'validation', details: errs }, 400)

  const payload = body as SubmitPayload

  // Rate limit : reject if cooldown still active
  const last = await getCooldown(env, payload.anon_id)
  if (last !== null) {
    const secsLeft = Math.ceil(SUBMIT_COOLDOWN_S - (Date.now() / 1000 - last))
    return jsonResp(
      {
        error: 'rate_limited',
        cooldown_remaining_s: Math.max(0, secsLeft),
      },
      429,
    )
  }

  // Persist (overwrite by anon_id — pseudo-idempotent)
  const record: KVRecord = {
    anon_id: payload.anon_id,
    display_name: payload.display_name || null,
    quote: payload.quote || null,
    schema_version: payload.schema_version,
    client_version: payload.client_version,
    submitted_at: payload.submitted_at,
    stats: payload.stats,
  }
  await putStats(env, record)
  await setCooldown(env, payload.anon_id, SUBMIT_COOLDOWN_S)

  return jsonResp({ ok: true, next_submit_in_s: SUBMIT_COOLDOWN_S })
}
