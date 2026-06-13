// Bootstrap a minimal KVRecord (stats) from an ArenaRecord's team_snapshot.
//
// Use case (Sprint 4) : web-native trainers go through /v1/arena/enable but
// never call /v1/submit (that's the CLI's path). Without a `stats:` row,
// GET /v1/trainer/<id> 404s, so /profile and trainer cards break.
//
// Solution : at enable time (and as a fallback in PATCH), write a zeroed
// stats record sourced from team_snapshot. The CLI keeps overwriting via
// /v1/submit ; the web fills in via Sprint 4 progression endpoints.

import type { ArenaRecord, KVRecord } from '../types'

export function bootstrapStatsFromArena(
  arena: ArenaRecord,
  clientVersion = 'web-bootstrap',
): KVRecord {
  const t = arena.team_snapshot
  return {
    anon_id: arena.anon_id,
    display_name: t.display_name ?? null,
    quote: null,
    bio: null,
    pinned_badges: [],
    origin: arena.origin,
    schema_version: 1,
    client_version: clientVersion,
    submitted_at: new Date().toISOString(),
    stats: {
      lifetime: {
        total_tokens: 0,
        total_evolutions: 0,
        total_shinies: 0,
        max_level: t.level,
        total_companions: 1,
        lineages_completed: [],
        games_won: 0,
        games_played: 0,
      },
      active: {
        lineage: t.lineage,
        current_level: t.level,
        is_shiny: t.is_shiny,
      },
      badges: [],
      pokedex_seen_count: 0,
      pokedex_seen_ids: [],
    },
  }
}
