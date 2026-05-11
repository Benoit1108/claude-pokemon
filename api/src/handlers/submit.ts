// POST /v1/submit  → submit stats payload (rate-limited 24h per anon_id)

import type { Env } from '../env.d'
import { jsonResp } from '../lib/http'
import { validateSubmit } from '../lib/validation'
import { getCooldown, getStats, putStats, setCooldown } from '../lib/kv'
import {
  POKEDEX_MAX_IDS,
  SUBMIT_COOLDOWN_S,
  type SubmitPayload,
  type KVRecord,
} from '../types'

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

  // Pinned badges are intersected with the user's actual badges — you can't
  // pin a badge you don't own (defense in depth even though the CLI checks).
  const ownedBadges = new Set(payload.stats.badges)
  const pinned = (payload.pinned_badges ?? [])
    .filter(b => ownedBadges.has(b))
    .slice(0, 3)

  // Pokédex ids — dedup + cap at POKEDEX_MAX_IDS as defense in depth even
  // though validation already enforces the bound. Keeps storage predictable
  // if the validator ever loosens.
  const stats = { ...payload.stats }
  if (stats.pokedex_seen_ids) {
    stats.pokedex_seen_ids = Array.from(new Set(stats.pokedex_seen_ids)).slice(
      0,
      POKEDEX_MAX_IDS,
    )
  }

  // Sprint 4 — origin tracking. Defaults :
  //   - if the payload declares one (CLI submits 'cli', web submits 'web'),
  //     use it ;
  //   - otherwise read the existing record's origin (preserves 'web' /
  //     'linked' across CLI submits that didn't know about the field) ;
  //   - else fall back to 'cli' (legacy default).
  // A 'linked' trainer keeps its origin even if a CLI submit lands.
  const existing = await getStats(env, payload.anon_id)
  const origin =
    existing?.origin === 'linked'
      ? 'linked'
      : payload.origin || existing?.origin || 'cli'

  // Persist (overwrite by anon_id — pseudo-idempotent)
  const record: KVRecord = {
    anon_id: payload.anon_id,
    display_name: payload.display_name || null,
    quote: payload.quote || null,
    bio: payload.bio || null,
    pinned_badges: pinned,
    origin,
    schema_version: payload.schema_version,
    client_version: payload.client_version,
    submitted_at: payload.submitted_at,
    stats,
  }
  await putStats(env, record)
  await setCooldown(env, payload.anon_id, SUBMIT_COOLDOWN_S)

  return jsonResp({ ok: true, next_submit_in_s: SUBMIT_COOLDOWN_S })
}
