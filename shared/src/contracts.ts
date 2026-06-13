// Over-the-wire contract types shared by the Worker API and the web arena.
//
// SINGLE SOURCE OF TRUTH for the submitted/served stats shape. Imported by
// `api/` and `web/` (via the `claude-pokemon-shared/contracts` subpath) so the
// contract can't drift between producer and consumer.
//
// NOT re-exported from the package root (index.ts) on purpose: the CLI's
// *persisted* save shape `LifetimeStats` (state-types.ts) is a different,
// all-optional/tolerant type with the same name. Keeping the wire contract on a
// dedicated subpath avoids the name collision while still being one definition.

export type { Lineage } from './types.js'
import type { Lineage } from './types.js'

/** Lifetime totals as submitted by the CLI / served to the web. */
export interface LifetimeStats {
  total_tokens: number
  total_evolutions: number
  total_shinies: number
  max_level: number
  total_companions: number
  /** @deprecated old key, read-only back-compat */
  total_compagnons?: number
  lineages_completed: Lineage[]
  games_won: number
  games_played: number
  /** Cumulative XP from wild-zone fights on the web (independent from the
   *  CLI's token-based total_tokens). Optional for back-compat; missing → 0. */
  total_zone_xp?: number
  /** Wild encounters won (fun stats + future achievement badges). */
  zone_wins?: number
}

/** The active companion's headline stats. */
export interface ActiveStats {
  lineage: Lineage | null
  current_level: number
  is_shiny: boolean
  /** XP toward the next level (resets on level-up). Optional for back-compat. */
  current_xp?: number
}
