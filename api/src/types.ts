// Shared contracts between handlers + KV layer + the arena frontend.
// Keep this file dependency-free so it can be imported anywhere.

export const SCHEMA_VERSION = 1
export const SUBMIT_COOLDOWN_S = 24 * 60 * 60
export const ANON_ID_RE = /^[a-f0-9]{8,16}$/
export const DISPLAY_NAME_RE = /^[a-zA-Z0-9_-]{2,24}$/

export const ALLOWED_LINEAGES = new Set([
  'fire',
  'water',
  'grass',
  'electric',
  'eevee',
  'chikorita',
  'cyndaquil',
  'totodile',
])

export const ALLOWED_BADGES = new Set([
  'hatch',
  'first_evolution',
  'first_shiny',
  'champion',
  'centurion',
  'constellation',
  'master_pokedex',
  'master_fire',
  'master_water',
  'master_grass',
  'master_electric',
  'master_eevee',
  'master_chikorita',
  'master_cyndaquil',
  'master_totodile',
])

export const LEADERBOARD_METRICS = new Set([
  'total_tokens',
  'total_evolutions',
  'total_shinies',
  'max_level',
  'lineages_completed_count',
  'badges_count',
  'games_won',
  'pokedex_seen_count',
])

export type LeaderboardMetric =
  | 'total_tokens'
  | 'total_evolutions'
  | 'total_shinies'
  | 'max_level'
  | 'lineages_completed_count'
  | 'badges_count'
  | 'games_won'
  | 'pokedex_seen_count'

export type Lineage =
  | 'fire'
  | 'water'
  | 'grass'
  | 'electric'
  | 'eevee'
  | 'chikorita'
  | 'cyndaquil'
  | 'totodile'

export interface LifetimeStats {
  total_tokens: number
  total_evolutions: number
  total_shinies: number
  max_level: number
  total_compagnons: number
  lineages_completed: Lineage[]
  games_won: number
  games_played: number
}

export interface ActiveStats {
  lineage: Lineage | null
  current_level: number
  is_shiny: boolean
}

export interface PlayerStats {
  lifetime: LifetimeStats
  active: ActiveStats
  badges: string[]
  pokedex_seen_count: number
}

export interface SubmitPayload {
  anon_id: string
  display_name?: string | null
  schema_version: number
  client_version: string
  submitted_at: string
  stats: PlayerStats
}

export interface KVRecord {
  anon_id: string
  display_name: string | null
  schema_version: number
  client_version: string
  submitted_at: string
  stats: PlayerStats
}

export interface LeaderboardEntry {
  anon_id: string
  display_name: string | null
  value: number
  lineage: Lineage | null
  level: number
  is_shiny: boolean
  submitted_at: string
}
