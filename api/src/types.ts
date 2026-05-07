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
  /** Free-form trainer quote, ≤80 chars, single line. Public-facing. */
  quote?: string | null
  /** Free-form trainer bio, ≤160 chars, multi-line allowed (Sprint 2.9). */
  bio?: string | null
  /** Up to 3 badge keys to pin on the public profile (Sprint 2.9). */
  pinned_badges?: string[] | null
  schema_version: number
  client_version: string
  submitted_at: string
  stats: PlayerStats
}

export interface KVRecord {
  anon_id: string
  display_name: string | null
  quote: string | null
  /** Trainer bio (Sprint 2.9). May be null on pre-2.9 records. */
  bio: string | null
  /** Pinned badges (Sprint 2.9). Always ≤PINNED_BADGES_MAX, dedup'd. */
  pinned_badges: string[]
  schema_version: number
  client_version: string
  submitted_at: string
  stats: PlayerStats
}

/** Max length of a trainer quote in chars. Validated server-side. */
export const QUOTE_MAX_LENGTH = 80
/** Max length of a trainer bio in chars (Sprint 2.9). */
export const BIO_MAX_LENGTH = 160
/** Max number of pinned badges shown on the public profile (Sprint 2.9). */
export const PINNED_BADGES_MAX = 3

export interface LeaderboardEntry {
  anon_id: string
  display_name: string | null
  value: number
  lineage: Lineage | null
  level: number
  is_shiny: boolean
  submitted_at: string
}

// ---------------------------------------------------------------------------
// Arena (Sprint 2.3) — async PvP battles
// ---------------------------------------------------------------------------
//
// A trainer must opt-in (POST /v1/arena/enable) to receive an arena_secret
// (returned ONCE, hashed server-side). The secret is required to spend their
// roster in a challenge. Defenders are passive snapshots — battles resolve
// deterministically from a seed.

export const ARENA_SECRET_RE = /^[a-f0-9]{32,64}$/
export const BATTLE_ID_RE = /^[a-f0-9]{16,32}$/
export const ARENA_MAX_TURNS = 50

// Effective combat type derived from lineage.
export type CombatType = 'fire' | 'water' | 'grass' | 'electric' | 'normal'

export const LINEAGE_TO_TYPE: Record<Lineage, CombatType> = {
  fire: 'fire',
  cyndaquil: 'fire',
  water: 'water',
  totodile: 'water',
  grass: 'grass',
  chikorita: 'grass',
  electric: 'electric',
  eevee: 'normal',
}

export interface BattleParticipant {
  anon_id: string
  display_name: string | null
  lineage: Lineage
  level: number
  is_shiny: boolean
}

export type BattleSide = 'challenger' | 'defender'

export interface BattleTurn {
  turn: number
  actor: BattleSide
  damage: number
  effectiveness: number // 0.5 / 1 / 2
  critical: boolean
  defender_hp_after: number
}

export interface BattleResult {
  battle_id: string | null // assigned by handler when persisted
  challenger: BattleParticipant
  defender: BattleParticipant
  seed: number
  turns: BattleTurn[]
  winner: BattleSide | 'draw'
  reason: 'ko' | 'turn_limit'
  created_at: string
}

export interface ArenaRecord {
  anon_id: string
  secret_hash: string // sha256(arena_secret) hex
  team_snapshot: BattleParticipant
  enabled_at: string
  updated_at: string
}

export interface ArenaOpponent {
  anon_id: string
  display_name: string | null
  lineage: Lineage
  level: number
  is_shiny: boolean
  updated_at: string
}

// Battle reactions (Sprint 2.8b) — bounded emoji set, rate-limited at
// 1 vote per anon_id per battle. Users can change their vote ; the old
// count is decremented and the new one incremented.
export const REACTION_KEYS = ['clap', 'fire', 'party', 'lol', 'tear', 'love'] as const
export type ReactionKey = (typeof REACTION_KEYS)[number]

export interface BattleReactions {
  counts: Record<ReactionKey, number>
  /** Map anon_id → the reaction they currently hold (for change-vote support). */
  voters: Record<string, ReactionKey>
}

export function emptyReactions(): BattleReactions {
  return {
    counts: { clap: 0, fire: 0, party: 0, lol: 0, tear: 0, love: 0 },
    voters: {},
  }
}
