// POST /v1/arena/regenerate — Bearer auth. Rotate the arena_secret and
// optionally update the team snapshot. Returns the new secret ONCE.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { validateTeamSnapshot } from '../../lib/validation'
import { getArena, putArena } from '../../lib/kv'
import { constantTimeEqual, extractBearer, generateArenaSecret, sha256Hex } from '../../lib/arena'
import type { ArenaRecord, BattleParticipant } from '../../types'

export async function handleArenaRegenerate(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }

  const errs = validateTeamSnapshot(body)
  if (errs.length) return jsonResp({ error: 'validation', details: errs }, 400)

  const team = body as BattleParticipant
  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const existing = await getArena(env, team.anon_id)
  if (!existing) return jsonResp({ error: 'not_enabled' }, 404)

  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, existing.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
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
    // Sprint 4 — preserve the existing origin. Rotating the secret doesn't
    // change who created the trainer (or whether they're linked).
    origin: existing.origin,
    enabled_at: existing.enabled_at,
    updated_at: now,
  }
  await putArena(env, record)

  return jsonResp({
    ok: true,
    arena_secret: secret,
    updated_at: now,
    team_snapshot: record.team_snapshot,
  })
}
