// Raw HTTP service layer for the claude-pokemon Worker API.
// Pure functions — no Vue dependencies. Composables wrap these.

import type {
  AggregateResponse,
  BattleResponse,
  ExploreOutcome,
  LeaderboardMetric,
  LeaderboardResponse,
  LiveBattleView,
  OpponentsResponse,
  TrainerResponse,
  ZoneDetail,
  ZoneFightResult,
  ZoneSummary,
} from '~/types/api'

export interface ApiClientConfig {
  baseUrl: string
  fetchImpl?: typeof $fetch
}

export class ApiClient {
  private readonly baseUrl: string
  private readonly fetcher: typeof $fetch

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl
    this.fetcher = config.fetchImpl || $fetch
  }

  aggregate(): Promise<AggregateResponse> {
    return this.fetcher<AggregateResponse>('/v1/aggregate', { baseURL: this.baseUrl })
  }

  leaderboard(
    metric: LeaderboardMetric = 'total_tokens',
    limit = 10,
  ): Promise<LeaderboardResponse> {
    return this.fetcher<LeaderboardResponse>('/v1/leaderboard', {
      baseURL: this.baseUrl,
      query: { metric, limit },
    })
  }

  trainer(anonId: string): Promise<TrainerResponse> {
    return this.fetcher<TrainerResponse>(`/v1/trainer/${anonId}`, { baseURL: this.baseUrl })
  }

  arenaOpponents(limit = 50): Promise<OpponentsResponse> {
    return this.fetcher<OpponentsResponse>('/v1/arena/opponents', {
      baseURL: this.baseUrl,
      query: { limit },
    })
  }

  arenaBattle(battleId: string): Promise<BattleResponse> {
    return this.fetcher<BattleResponse>(`/v1/arena/battle/${battleId}`, {
      baseURL: this.baseUrl,
    })
  }

  arenaLive(battleId: string): Promise<LiveBattleView> {
    return this.fetcher<LiveBattleView>(`/v1/arena/live/${battleId}`, {
      baseURL: this.baseUrl,
    })
  }

  arenaPairRedeem(code: string): Promise<{ ok: true; anon_id: string; arena_secret: string }> {
    return this.fetcher('/v1/arena/pair/redeem', {
      method: 'POST',
      baseURL: this.baseUrl,
      body: { code },
    })
  }

  arenaLiveCommit(args: {
    battleId: string
    anonId: string
    moveId: string
    arenaSecret: string
  }): Promise<LiveBattleView & { ok: true }> {
    return this.fetcher(`/v1/arena/live/${args.battleId}/commit`, {
      method: 'POST',
      baseURL: this.baseUrl,
      headers: { authorization: `Bearer ${args.arenaSecret}` },
      body: { anon_id: args.anonId, move_id: args.moveId },
    })
  }

  /** Sprint 3.6 — partial profile update. Any field passed `null` clears it.
   * Server intersects pinned_badges with the trainer's owned badges. */
  trainerProfilePatch(args: {
    anonId: string
    arenaSecret: string
    patch: {
      display_name?: string | null
      quote?: string | null
      bio?: string | null
      pinned_badges?: string[] | null
    }
  }): Promise<{
    ok: true
    trainer: {
      anon_id: string
      display_name: string | null
      quote: string | null
      bio: string | null
      pinned_badges: string[]
    }
  }> {
    return this.fetcher(`/v1/trainer/${args.anonId}/profile`, {
      method: 'PATCH',
      baseURL: this.baseUrl,
      headers: { authorization: `Bearer ${args.arenaSecret}` },
      body: args.patch,
    })
  }

  /**
   * Sprint 4.2 — web-native trainer signup. Wraps POST /v1/arena/enable
   * with the same payload shape as the CLI's enable flow but stamped
   * origin='web'. Returns the arena_secret ONCE — caller MUST persist it
   * to localStorage (via useArenaSession.set) immediately.
   */
  arenaEnable(args: {
    anon_id: string
    display_name?: string | null
    lineage:
      | 'fire'
      | 'water'
      | 'grass'
      | 'electric'
      | 'eevee'
      | 'chikorita'
      | 'cyndaquil'
      | 'totodile'
    level: number
    is_shiny: boolean
    origin: 'cli' | 'web'
  }): Promise<{
    ok: true
    arena_secret: string
    enabled_at: string
    origin: 'cli' | 'web'
    team_snapshot: {
      anon_id: string
      display_name: string | null
      lineage: string
      level: number
      is_shiny: boolean
    }
  }> {
    return this.fetcher('/v1/arena/enable', {
      method: 'POST',
      baseURL: this.baseUrl,
      body: args,
    })
  }

  /**
   * Sprint 5 — recovery-key sign-in. Validates a {anon_id, arena_secret}
   * pair against the stored ArenaRecord without mutating anything. Used by
   * /login to verify pasted credentials before persisting to localStorage.
   * Returns the team snapshot on success ; throws on 400/401/404 so the
   * caller can show a precise error message.
   */
  arenaWhoami(args: { anonId: string; arenaSecret: string }): Promise<{
    ok: true
    anon_id: string
    enabled_at: string
    updated_at: string
    origin: 'cli' | 'web' | 'linked'
    team_snapshot: {
      anon_id: string
      display_name: string | null
      lineage: string
      level: number
      is_shiny: boolean
    }
  }> {
    return this.fetcher(`/v1/arena/whoami?anon_id=${encodeURIComponent(args.anonId)}`, {
      method: 'GET',
      baseURL: this.baseUrl,
      headers: { authorization: `Bearer ${args.arenaSecret}` },
    })
  }

  /**
   * Sprint 4.3 — web-side initiator of the pair flow. Same endpoint the CLI
   * uses for CLI→web pairing ; this time the WEB issues the code and the
   * CLI redeems it via `/pokemon arena link <code>`. Bearer auth.
   */
  arenaPairInit(args: {
    anonId: string
    arenaSecret: string
  }): Promise<{ ok: true; code: string; expires_at: string; ttl_s: number }> {
    return this.fetcher('/v1/arena/pair/init', {
      method: 'POST',
      baseURL: this.baseUrl,
      headers: { authorization: `Bearer ${args.arenaSecret}` },
      body: { anon_id: args.anonId },
    })
  }

  // Sprint 4.5+ — wild zones API
  zonesList(): Promise<{ zones: ZoneSummary[] }> {
    return this.fetcher('/v1/zones', { baseURL: this.baseUrl })
  }

  zoneDetail(id: string): Promise<ZoneDetail> {
    return this.fetcher(`/v1/zones/${id}`, { baseURL: this.baseUrl })
  }

  zoneExplore(args: {
    zoneId: string
    anonId: string
    arenaSecret: string
  }): Promise<ExploreOutcome> {
    return this.fetcher(`/v1/zone/${args.zoneId}/explore`, {
      method: 'POST',
      baseURL: this.baseUrl,
      headers: { authorization: `Bearer ${args.arenaSecret}` },
      body: { anon_id: args.anonId },
    })
  }

  zoneFight(args: {
    zoneId: string
    anonId: string
    arenaSecret: string
  }): Promise<ZoneFightResult> {
    return this.fetcher(`/v1/zone/${args.zoneId}/fight`, {
      method: 'POST',
      baseURL: this.baseUrl,
      headers: { authorization: `Bearer ${args.arenaSecret}` },
      body: { anon_id: args.anonId },
    })
  }

  zoneFlee(args: {
    zoneId: string
    anonId: string
    arenaSecret: string
  }): Promise<{ ok: true; fled: boolean }> {
    return this.fetcher(`/v1/zone/${args.zoneId}/flee`, {
      method: 'POST',
      baseURL: this.baseUrl,
      headers: { authorization: `Bearer ${args.arenaSecret}` },
      body: { anon_id: args.anonId },
    })
  }
}
