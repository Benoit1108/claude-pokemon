// Shared contracts between handlers + KV layer + the arena frontend.
//
// Sprint 3 A4 — the battle-related types (Lineage, BattleParticipant,
// BattleTurn, BattleResult, BattleSide, CombatType, ARENA_MAX_TURNS,
// LINEAGE_TO_TYPE, ALLOWED_LINEAGES) now live in `claude-pokemon-shared`
// and are re-exported below. This file keeps only the worker-specific
// types : KVRecord, SubmitPayload, leaderboard metrics, regexes, ArenaRecord,
// LiveBattleRecord, PairRecord, etc.

// Some of the shared types are used INSIDE this file (KVRecord.team_snapshot
// is a BattleParticipant, LeaderboardEntry has a Lineage, etc.) so we import
// them with `import type` for in-file use. The same names are also re-exported
// so handlers can `import { BattleParticipant } from '../../types'` without
// reaching into the shared package directly.
import type { BattleParticipant, BattleSide, BattleTurn, Lineage } from 'claude-pokemon-shared'

export {
  ARENA_MAX_TURNS,
  ALLOWED_LINEAGES,
  LINEAGE_TO_TYPE,
  type BattleParticipant,
  type BattleResult,
  type BattleSide,
  type BattleTurn,
  type CombatType,
  type Lineage,
} from 'claude-pokemon-shared'

export const SCHEMA_VERSION = 1
export const SUBMIT_COOLDOWN_S = 24 * 60 * 60
export const ANON_ID_RE = /^[a-f0-9]{8,16}$/
export const DISPLAY_NAME_RE = /^[a-zA-Z0-9_-]{2,24}$/

export const ALLOWED_BADGES = new Set([
  'hatch',
  'first_evolution',
  'first_shiny',
  'champion',
  'centurion',
  'constellation',
  'master_pokedex',
  // Sprint 2.11 — wild pokédex milestones
  'dex_50',
  'dex_100',
  'regional_kanto',
  'regional_johto',
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
  /** List of wild species ids the trainer has encountered (Sprint 2.11).
   * Capped at POKEDEX_MAX_IDS server-side ; pre-2.11 records may omit this. */
  pokedex_seen_ids?: string[]
}

/** Max number of pokédex ids accepted in the submit payload. Generous bound
 * (Gen 1 + Gen 2 = 251) with headroom for future generations. */
export const POKEDEX_MAX_IDS = 1000
export const POKEDEX_ID_RE = /^[a-z][a-z0-9-]{1,32}$/

/**
 * Where did this trainer's identity come from (Sprint 4) ?
 *
 *  - 'cli'    — created via `/pokemon arena enable --confirm` on the CLI.
 *  - 'web'    — created via `POST /v1/web/signup` on the arena web (Sprint 4.2).
 *  - 'linked' — created on one side, then linked to a client on the other
 *               via the bidirectional pair flow. The trainer record is the
 *               same ; this just flags "both clients exist".
 *
 * Pre-Sprint-4 records have no origin field — readers MUST treat the
 * missing value as 'cli' (lazy migration). The submit handler stamps 'cli'
 * on every legacy record the next time it gets touched.
 */
export type TrainerOrigin = 'cli' | 'web' | 'linked'

export const TRAINER_ORIGINS: ReadonlySet<TrainerOrigin> = new Set(['cli', 'web', 'linked'])

/** Clients can only declare 'cli' or 'web' — 'linked' is set server-side
 * during the pair-redeem flow, never from a payload. */
export const CLIENT_DECLARABLE_ORIGINS: ReadonlySet<TrainerOrigin> = new Set(['cli', 'web'])

export interface SubmitPayload {
  anon_id: string
  display_name?: string | null
  /** Free-form trainer quote, ≤80 chars, single line. Public-facing. */
  quote?: string | null
  /** Free-form trainer bio, ≤160 chars, multi-line allowed (Sprint 2.9). */
  bio?: string | null
  /** Up to 3 badge keys to pin on the public profile (Sprint 2.9). */
  pinned_badges?: string[] | null
  /** Sprint 4 — trainer origin declared by the client. Optional ; legacy
   * CLI submits omit it and default to 'cli'. */
  origin?: 'cli' | 'web'
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
  /** Sprint 4 — trainer origin. Always present after migration ; readers
   * of legacy records fill in 'cli' as the default. */
  origin: TrainerOrigin
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

export interface ArenaRecord {
  anon_id: string
  secret_hash: string // sha256(arena_secret) hex
  team_snapshot: BattleParticipant
  /** Sprint 4 — origin set at /v1/arena/enable time. Legacy records
   * default to 'cli' on read. Mutated to 'linked' on a successful pair
   * redeem from the other client. */
  origin: TrainerOrigin
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

// CLI ↔ web pairing (Sprint 2.12) — short-lived one-shot codes that hand off
// the arena_secret from the CLI install to a browser localStorage so the web
// can issue Bearer-authed requests (live PvP move picker, future features).
//
// Flow :
//   1. CLI calls /v1/arena/pair/init with Bearer auth → worker stores
//      `pair:<code>` (short TTL) and returns the code.
//   2. CLI shows the code (and a /pair?code=… URL) to the user.
//   3. Web calls /v1/arena/pair/redeem with { code }. Worker reads, DELETES
//      the entry, returns the secret. Web stores in localStorage.
//
// Trade-off : the secret leaves the CLI's local file. We bound the risk with
// (a) short TTL (5 min), (b) one-shot redeem, (c) explicit user opt-in (must
// run /pokemon arena pair). Acceptable for the UX win — without this the web
// is read-only.

export const PAIR_CODE_TTL_S = 5 * 60
export const PAIR_CODE_LENGTH = 6
/** Crockford-ish alphabet : no 0/O, 1/I, U (avoid offensive 4-letter codes). */
export const PAIR_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTVWXYZ23456789'
export const PAIR_CODE_RE = /^[A-HJ-NP-TV-Z2-9]{6}$/

export interface PairRecord {
  anon_id: string
  /** Plaintext arena_secret. Lives in KV at most PAIR_CODE_TTL_S seconds and
   * is consumed (deleted) on first redeem. */
  arena_secret: string
  created_at: string
  expires_at: string
  /** Sprint 2.13 — token of the redeemer that claimed this code. Only one
   * redeemer wins (last writer's token sticks under KV last-write-wins
   * semantics). Set by handlePairRedeem during its claim-and-verify dance. */
  consumed_by?: string
}

// ---------------------------------------------------------------------------
// Wild zones (Sprint 4.5) — web-native exploration / encounters
// ---------------------------------------------------------------------------

/** A wild encounter freshly rolled by /v1/zone/<id>/explore. Persisted in
 * KV under `zone:encounter:<anon_id>` with a 5-min TTL so Sprint 4.6's
 * /fight handler can verify the species/level/shiny client-side claims
 * match an actual server-issued encounter (anti-cheat). */
export interface PendingEncounter {
  zone_id: string
  species_id: string
  level: number
  is_shiny: boolean
  /** Pool the species was rolled from. Useful for XP modifiers later. */
  pool: 'common' | 'rare' | 'legendary'
  created_at: string
  expires_at: string
}

/** Item drops from /explore — kept minimal for the MVP. Sprint 4.6+ wires
 * these into the trainer's inventory. */
export type ItemDropKind = 'berry' | 'potion' | 'pokeball' | 'rare-candy'

export interface ItemDrop {
  kind: ItemDropKind
  emoji: string
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

// ---------------------------------------------------------------------------
// Live PvP (Sprint 2.10) — turn-by-turn 1v1 with polling
// ---------------------------------------------------------------------------
//
// A live battle starts when a challenger invites a defender (must both be
// arena-enabled). The defender accepts to flip state from 'pending' → 'active'.
// Once active, both sides commit one move per turn ; when both have committed,
// the worker resolves the turn server-side (move selection requires server
// trust — clients can't be allowed to fake damage).
//
// State machine :
//   pending → active → finished
//                   → expired (last_activity_at > LIVE_BATTLE_INACTIVITY_S)
//                   → abandoned (someone forfeit)
//
// KV TTL : 1h from last activity. Battles auto-expire ; no need for sweeps.

export const LIVE_BATTLE_TTL_S = 60 * 60 // 1 hour
export const LIVE_BATTLE_INACTIVITY_S = 5 * 60 // forfeit if no activity for 5 min
export const LIVE_BATTLE_INVITE_COOLDOWN_S = 30 // 30s between invites per challenger

export type LiveBattleState =
  | 'pending'   // challenger created it, waiting for defender accept
  | 'active'    // both joined, exchanging turns
  | 'finished'  // resolved (KO or turn limit)
  | 'expired'   // inactivity timeout
  | 'abandoned' // someone forfeit

export interface LiveBattleSide {
  anon_id: string
  /** sha256(arena_secret) hex — matches the persisted ArenaRecord. */
  secret_hash: string
  snapshot: BattleParticipant
  hp: number
  /** ID of the move committed for the current turn, null until commit. */
  pending_action: string | null
}

export interface LiveBattleRecord {
  battle_id: string
  state: LiveBattleState
  challenger: LiveBattleSide
  /** Defender side is filled at /accept time. Pre-accept, only anon_id is set. */
  defender: LiveBattleSide | { anon_id: string }
  turn_no: number
  turn_log: BattleTurn[]
  winner: BattleSide | 'draw' | null
  reason: 'ko' | 'turn_limit' | 'forfeit' | 'expired' | null
  created_at: string
  last_activity_at: string
  /** Set by /forfeit so the public status can show who quit. */
  forfeit_by: BattleSide | null
}

/** Wire format for GET /v1/arena/live/:id — strips secret_hash from sides. */
export interface LiveBattleView {
  battle_id: string
  state: LiveBattleState
  challenger: {
    anon_id: string
    snapshot: BattleParticipant
    hp: number
    /** Whether they've committed an action for the current turn (boolean only,
     * actual move id is hidden until both reveal). */
    has_pending_action: boolean
  }
  defender: {
    anon_id: string
    snapshot: BattleParticipant | null
    hp: number | null
    has_pending_action: boolean
  }
  turn_no: number
  turn_log: BattleTurn[]
  winner: BattleSide | 'draw' | null
  reason: 'ko' | 'turn_limit' | 'forfeit' | 'expired' | null
  created_at: string
  last_activity_at: string
  forfeit_by: BattleSide | null
}
