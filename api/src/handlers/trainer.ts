// GET /v1/trainer/<anon_id>  → full public record for arena trainer page.
// Returns the same data as a leaderboard entry but with all stats + badges.
// Privacy: only fields submitted by the user (whitelist validated upstream).

import type { Env } from '../env.d'
import { jsonResp } from '../lib/http'
import { getStats } from '../lib/kv'

export async function handleTrainer(pathname: string, env: Env): Promise<Response> {
  const m = pathname.match(/^\/v1\/trainer\/([a-f0-9]{8,16})$/)
  if (!m) return jsonResp({ error: 'invalid_path' }, 400)

  const anon_id = m[1]!
  const record = await getStats(env, anon_id)
  if (!record) return jsonResp({ error: 'trainer_not_found' }, 404)

  return jsonResp(
    {
      anon_id: record.anon_id,
      display_name: record.display_name || null,
      // `quote` was added in v1.0.0-beta.7 — older KV entries may not have it.
      quote: record.quote || null,
      submitted_at: record.submitted_at,
      client_version: record.client_version,
      stats: record.stats,
    },
    200,
  )
}
