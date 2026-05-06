// GET /v1/leaderboard?metric=X&limit=N  → top N players by metric

import type { Env } from '../env.d'
import { jsonResp } from '../lib/http'
import { listAllStats } from '../lib/kv'
import {
  LEADERBOARD_METRICS,
  type LeaderboardMetric,
  type LeaderboardEntry,
  type KVRecord,
} from '../types'

function metricFromRecord(r: KVRecord, metric: LeaderboardMetric): number {
  const lt = r.stats.lifetime
  switch (metric) {
    case 'total_tokens':
      return lt.total_tokens
    case 'total_evolutions':
      return lt.total_evolutions
    case 'total_shinies':
      return lt.total_shinies
    case 'max_level':
      return lt.max_level
    case 'lineages_completed_count':
      return (lt.lineages_completed || []).length
    case 'badges_count':
      return (r.stats.badges || []).length
    case 'games_won':
      return lt.games_won || 0
    case 'pokedex_seen_count':
      return r.stats.pokedex_seen_count || 0
    default:
      return 0
  }
}

export async function handleLeaderboard(url: URL, env: Env): Promise<Response> {
  const metric = (url.searchParams.get('metric') || 'total_tokens') as LeaderboardMetric
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 100)

  if (!LEADERBOARD_METRICS.has(metric)) {
    return jsonResp({ error: 'unknown_metric', allowed: [...LEADERBOARD_METRICS] }, 400)
  }

  const records = await listAllStats(env)
  const ranked: LeaderboardEntry[] = records
    .map(r => ({
      anon_id: r.anon_id,
      display_name: r.display_name || null,
      value: metricFromRecord(r, metric),
      lineage: r.stats.active.lineage,
      level: r.stats.active.current_level,
      is_shiny: r.stats.active.is_shiny,
      submitted_at: r.submitted_at,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)

  return jsonResp({ metric, total_players: records.length, top: ranked })
}
