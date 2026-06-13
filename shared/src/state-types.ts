// Domain types for the two persisted documents: ~/.claude/pokemon/state.json
// (the save) and data.json (config + game content). These are the contract the
// whole engine operates on — the missing piece of the TS migration, which had
// ported the logic but left the domain as `any`.
//
// Conventions:
// - Old saves predate many fields → almost everything is optional; the code
//   keeps its defensive `?? default` reads.
// - jq-era null-safety is preserved: `string | null` where bash stored null.
// - Both documents are user-editable files: runtime reads should stay tolerant,
//   but WRITES must go through these types so typos are compile errors.

// ── state.json ───────────────────────────────────────────────────────────────

export interface EvolutionEntry {
  level?: number
  name?: string
  evolved_at?: string
  is_shiny?: boolean
}

export interface BadgeEntry {
  id: string
  earned_at: string
}

export interface PokedexEntry {
  seen?: boolean
  count?: number
  first_seen_at?: string | null
  shiny_seen?: boolean
  shiny_count?: number
}

export interface WildSeenEntry {
  count?: number
  first_seen_at?: string
  last_seen_at?: string
}

export interface SessionBaseline {
  total_xp?: number
  friendship?: number
  lifetime_tokens?: number
  lineage?: string | null
  current_level?: number
  evolution_count?: number
  badge_count?: number
  pokedex_wild_count?: number
  games_won?: number
}

export interface SessionEntry {
  first_seen?: string
  last_seen?: string
  last_tick_tokens?: number
  max_context_tokens?: number
  pending_tokens?: number
  last_xp_credit_at?: number
  baseline?: SessionBaseline
}

export interface LifetimeStats {
  total_tokens?: number
  total_evolutions?: number
  total_shinies?: number
  max_level?: number
  lineages_completed?: string[]
  total_compagnons?: number
  first_shiny_at?: string | null
  games_won?: number
  games_played?: number
}

/** An archived companion (team slot / PC box). */
export interface CompanionEntry {
  lineage?: string | null
  is_shiny?: boolean
  level?: number
  total_xp?: number
  max_stage?: string
  evolution_history?: EvolutionEntry[]
  eevee_form?: string | null
  items?: Record<string, number>
  created_at?: string
  completed_at?: string
  /** 'trade' for traded wilds; absent for raised companions. */
  source?: string
}

export interface RecentEvent {
  type: 'berry' | 'encounter' | 'battle_won' | 'battle_lost' | 'item' | 'trade'
  at: string
  id?: string
  name?: string
  emoji?: string
  xp?: number
  wild_level?: number
}

export interface XpMultipliers {
  context?: string
  type_match?: string
  daily_bonus?: string
  status?: string
}

export interface CurrentQuiz {
  id?: string
  started_at?: string
}

export interface PokemonState {
  version?: number
  lineage?: string | null
  is_shiny?: boolean
  current_level?: number
  total_xp?: number
  evolution_history?: EvolutionEntry[]
  evolution_flash_remaining?: number
  eevee_form?: string | null
  sessions?: Record<string, SessionEntry>
  badges?: BadgeEntry[]
  team?: CompanionEntry[]
  pc_storage?: CompanionEntry[]
  pokedex?: Record<string, PokedexEntry>
  pokedex_wild?: Record<string, WildSeenEntry>
  lifetime_stats?: LifetimeStats
  items?: Record<string, number>
  held_item?: string | null
  friendship?: number
  status?: string
  high_context_streak?: number
  injured_ticks_remaining?: number
  last_daily_bonus_date?: string
  last_xp_multipliers?: XpMultipliers
  recent_events?: RecentEvent[]
  animation_frame_index?: number
  xp_rebalance_v2_acknowledged?: boolean
  current_quiz?: CurrentQuiz
  last_game_completed_at?: string
  last_trade_at?: string
  /** Last opt-in stats auto-submit (24h cooldown, see autosubmit.ts). */
  last_stats_submit_at?: string
  created_at?: string
  last_updated?: string
}

// ── data.json (config + game content) ───────────────────────────────────────

export interface StageDef {
  min_level: number
  name?: string
  emoji?: string
  color?: string
  showdown_id?: string
  /** Eevee branch forms etc. carry extra display fields; keep them readable. */
  [extra: string]: unknown
}

export interface LineageDef {
  label?: string
  stages?: StageDef[]
  /** Eevee form → stages override map and similar lineage extras. */
  [extra: string]: unknown
}

export interface WildPoolEntry {
  id: string
  type?: string
  national_dex?: number
  name_fr?: string
  name_en?: string
}

export interface ItemDef {
  name?: string
  emoji?: string
  holdable?: boolean | null
  effect_xp_mult?: number
  [extra: string]: unknown
}

export interface BerryDef {
  id?: string
  name?: string
  emoji?: string
  xp_bonus?: number
}

export interface SeasonDef {
  month?: number
  day_start?: number
  day_end?: number
  boost_mult_xp?: number
  [extra: string]: unknown
}

export interface StatsShareConfig {
  enabled?: boolean
  // Nullable: reset operations (config quote/bio, share regen) write literal
  // null to clear the field — preserved from the jq/bash era. Reads use `?? ''`.
  anon_id?: string | null
  display_name?: string | null
  endpoint?: string
  quote?: string | null
  bio?: string | null
  pins?: string[]
  [extra: string]: unknown
}

export interface ArenaConfig {
  enabled?: boolean
  enabled_at?: string
  web_url?: string
  last_battle_id?: string
  last_live_battle_id?: string
}

export interface PokemonData {
  version?: string
  language?: string
  theme?: string
  thresholds?: number[]
  lineages?: Record<string, LineageDef>
  wild_pool?: WildPoolEntry[]
  items?: Record<string, ItemDef>
  berries?: BerryDef[]
  seasons?: Record<string, SeasonDef>
  eevee_evolution_rules?: Record<string, string>
  eevee_friendship_threshold?: number
  event_chances?: { berry?: number; encounter?: number }
  battle_chance_on_encounter?: number
  item_drop_chance_on_encounter?: number
  battle_xp_min?: number
  battle_xp_max?: number
  battle_injured_ticks?: number
  shiny_mode?: string
  shiny_chance?: number
  shiny_hunter_mode?: boolean
  starter_pick?: string
  display_sprite_in_statusline?: string | boolean
  enable_animations?: boolean
  enable_sound?: boolean
  stats_share?: StatsShareConfig
  arena?: ArenaConfig
  game_cooldown_minutes?: number
  game_xp_reward?: number
  game_friendship_reward?: number
  trade_cooldown_hours?: number
  /** data.json is a user-editable document with historical extras. */
  [extra: string]: unknown
}
