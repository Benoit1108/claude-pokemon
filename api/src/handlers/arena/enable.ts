// POST /v1/arena/enable — first-time opt-in. Returns arena_secret ONCE.
// 409 if already enabled (use /regenerate to rotate).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { validateTeamSnapshot } from '../../lib/validation'
import { getArena, putArena } from '../../lib/kv'
import { generateArenaSecret, sha256Hex } from '../../lib/arena'
import type { ArenaRecord, BattleParticipant } from '../../types'

export async function handleArenaEnable(request: Request, env: Env): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }

  const errs = validateTeamSnapshot(body)
  if (errs.length) return jsonResp({ error: 'validation', details: errs }, 400)

  const team = body as BattleParticipant

  const existing = await getArena(env, team.anon_id)
  if (existing) {
    return jsonResp(
      {
        error: 'already_enabled',
        message: 'Arena already enabled. Use /v1/arena/regenerate to rotate the secret.',
        enabled_at: existing.enabled_at,
      },
      409,
    )
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
    enabled_at: now,
    updated_at: now,
  }
  await putArena(env, record)

  return jsonResp({
    ok: true,
    arena_secret: secret, // returned ONCE — client must persist locally
    enabled_at: now,
    team_snapshot: record.team_snapshot,
  })
}
