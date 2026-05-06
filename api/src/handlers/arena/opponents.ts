// GET /v1/arena/opponents?limit=N — public list of enabled trainers.
// Returns sanitized snapshots (no secret_hash, no internal timestamps beyond updated_at).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { listAllArenas } from '../../lib/kv'
import type { ArenaOpponent } from '../../types'

export async function handleArenaOpponents(url: URL, env: Env): Promise<Response> {
  const rawLimit = url.searchParams.get('limit')
  const limit = Math.min(Math.max(parseInt(rawLimit || '50', 10) || 50, 1), 200)

  const records = await listAllArenas(env)
  const opponents: ArenaOpponent[] = records
    .map(r => ({
      anon_id: r.anon_id,
      display_name: r.team_snapshot.display_name,
      lineage: r.team_snapshot.lineage,
      level: r.team_snapshot.level,
      is_shiny: r.team_snapshot.is_shiny,
      updated_at: r.updated_at,
    }))
    .sort((a, b) => b.level - a.level || a.anon_id.localeCompare(b.anon_id))
    .slice(0, limit)

  return jsonResp({ opponents, total: records.length })
}
