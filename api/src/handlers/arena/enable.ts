// POST /v1/arena/enable — first-time opt-in. Returns arena_secret ONCE.
// 409 if already enabled (use /regenerate to rotate).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { validateTeamSnapshot } from '../../lib/validation'
import { getArena, putArena } from '../../lib/kv'
import { generateArenaSecret, sha256Hex } from '../../lib/arena'
import {
  CLIENT_DECLARABLE_ORIGINS,
  type ArenaRecord,
  type BattleParticipant,
  type TrainerOrigin,
} from '../../types'

export async function handleArenaEnable(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }

  const errs = validateTeamSnapshot(body)
  if (errs.length) return jsonResp({ error: 'validation', details: errs }, 400)

  const team = body as BattleParticipant & { origin?: string }

  // Sprint 4 — optional origin declaration. CLI omits it (legacy) →
  // default 'cli'. Web /signup will send 'web'. Anything else is rejected
  // to avoid clients smuggling 'linked' (worker-only state).
  let origin: TrainerOrigin = 'cli'
  if (typeof team.origin === 'string') {
    if (!CLIENT_DECLARABLE_ORIGINS.has(team.origin as TrainerOrigin)) {
      return jsonResp(
        { error: 'invalid_origin', allowed: Array.from(CLIENT_DECLARABLE_ORIGINS) },
        400,
      )
    }
    origin = team.origin as TrainerOrigin
  }

  // Sprint 2.13 (Q2) — error response shape unified : `{error: code, ...extras}`.
  const existing = await getArena(env, team.anon_id)
  if (existing) {
    return jsonResp({ error: 'already_enabled', enabled_at: existing.enabled_at }, 409)
  }

  const secret = generateArenaSecret()
  const now = new Date().toISOString()
  const record: ArenaRecord = {
    anon_id: team.anon_id,
    secret_hash: await sha256Hex(secret),
    team_snapshot: {
      anon_id: team.anon_id,
      display_name: team.display_name ?? null,
      lineage: team.lineage,
      level: team.level,
      is_shiny: team.is_shiny,
    },
    origin,
    enabled_at: now,
    updated_at: now,
  }
  await putArena(env, record)

  return jsonResp({
    ok: true,
    arena_secret: secret, // returned ONCE — client must persist locally
    enabled_at: now,
    origin,
    team_snapshot: record.team_snapshot,
  })
}
