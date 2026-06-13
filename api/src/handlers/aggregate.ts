// GET /v1/aggregate  → global aggregate stats

import type { Env } from '../env.d'
import { jsonResp } from '../lib/http'
import { listAllStats } from '../lib/kv'

export async function handleAggregate(env: Env): Promise<Response> {
  const records = await listAllStats(env)
  if (records.length === 0) {
    return jsonResp({ total_players: 0 })
  }

  let totalTokens = 0
  let totalShinies = 0
  let totalCompanions = 0
  const starterDist: Record<string, number> = {}

  for (const r of records) {
    const lt = r.stats.lifetime
    totalTokens += lt.total_tokens
    totalShinies += lt.total_shinies
    totalCompanions += lt.total_companions ?? lt.total_compagnons ?? 0
    const lin = r.stats.active.lineage
    if (lin) starterDist[lin] = (starterDist[lin] || 0) + 1
  }

  return jsonResp({
    total_players: records.length,
    total_tokens_combined: totalTokens,
    total_shinies_observed: totalShinies,
    shiny_rate_observed: totalCompanions > 0 ? +(totalShinies / totalCompanions).toFixed(5) : null,
    active_lineage_distribution: starterDist,
  })
}
