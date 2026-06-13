// Statusline tick (Phase R3d-3) — ported from pokemon_tick (lib/lib.sh).
//
// The engine owns ALL tick LOGIC but tires NO randomness itself: every random
// outcome is resolved upstream (bash, with its current RNG) and passed in via
// `decisions`, so the engine is a pure deterministic function of
// (state, data, now, tokens, used_pct, decisions). This makes it fully
// testable: forcing decisions to "nothing" makes the whole tick deterministic
// and byte-diffable against the bash tick. (At R3d-5, when bash is dropped, the
// engine will generate `decisions` itself via Math.random.)
//
// Out of scope here (stay bash until later phases): the auto-submit curl
// (network → R3d-4) and the RNG roll computation itself.
//
// Structure: `tick` is a short linear composition of pure phase-functions, in
// the SAME order as the bash tick. Each phase mutates the working state `s` and
// the shared `TickCtx` (locals that cross phase boundaries — lineage, the
// multiplier values, the token-delta accumulators, prevLevel/isShiny, the live
// session ref). Order and data flow are load-bearing: do not reorder mutations.
import { levelFromXp, xpMultiplier, typeMatchMultiplier } from 'claude-pokemon-shared/xp'
import { evoField } from './render/views.js'
import { archiveToTeam, checkBadges } from './collection.js'
import type {
  LifetimeStats,
  PokedexEntry,
  PokemonData,
  PokemonState,
  RecentEvent,
  SessionEntry,
  StageDef,
} from 'claude-pokemon-shared/state-types'

export interface TickDecisions {
  /** Lineage to assign when the active has none (bash pokemon_pick_starter). */
  starter?: string | null
  /** Shiny roll outcome — applied only on the 0→1 hatch. */
  shiny: boolean
  /** Index 0-2 into [fire_stone, water_stone, thunder_stone] for the low-
   *  friendship Eevee fallback. */
  eevee_fallback_index: number
  berry: { fired: boolean; index: number }
  encounter: { fired: boolean; index: number }
  battle: { fired: boolean; wild_level: number; bonus_xp_raw: number }
  item: { fired: boolean; index: number }
}

export interface TickInput {
  state: PokemonState
  data: PokemonData
  now: string
  now_epoch: number
  session_id: string
  current_tokens: number
  used_pct?: number | null
  decisions: TickDecisions
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

function prepend10(list: RecentEvent[] | undefined, ev: RecentEvent): RecentEvent[] {
  return [ev, ...(Array.isArray(list) ? list : [])].slice(0, 10)
}

/** Working state shared across phases. `s` is the cloned PokemonState being
 *  mutated in place; the other fields are the locals that the original linear
 *  `tick` carried between phase banners. Mutation order is preserved exactly. */
interface TickCtx {
  s: PokemonState
  data: PokemonData
  now: string
  nowEpoch: number
  sid: string
  currentTokens: number
  usedPct: number | null
  decisions: TickDecisions
  thresholds: number[]
  maxLevel: number

  // Refs into `s`, captured during migration so later phases reuse them.
  pokedex: Record<string, PokedexEntry>
  ls: LifetimeStats
  sess: SessionEntry

  // Carried locals.
  lineage: string
  isShiny: boolean
  prevLevel: number

  // Token-delta accumulator outputs.
  rawDelta: number
  delta: number

  // Multiplier phase outputs.
  d: Date
  xpMult: number
  typeMatch: number
  dailyMult: number
  statusMult: number
  heldMult: number
  injuredMult: number
  seasonMult: number
  shinyHunter: boolean
  weightedDelta: number
}

// ── Schema migration (forward-compat) ──
function migrateSchema(c: TickCtx): void {
  const s = c.s
  s.badges ??= []
  s.team ??= []
  s.pc_storage ??= []
  c.pokedex = s.pokedex ??= {}
  c.ls = s.lifetime_stats ??= {
    total_tokens: 0,
    total_evolutions: 0,
    total_shinies: 0,
    max_level: 0,
    lineages_completed: [],
    total_companions: 1,
    first_shiny_at: null,
  }
  const ls = c.ls
  if (ls.total_companions === undefined && ls.total_compagnons !== undefined) {
    ls.total_companions = ls.total_compagnons
  }
  delete ls.total_compagnons
}

// ── Retroactive backfill (idempotent) ──
function backfillRetroactive(c: TickCtx): void {
  const { s, pokedex, ls } = c
  ls.max_level = (ls.max_level ?? 0) > (s.current_level ?? 0) ? ls.max_level : s.current_level
  const linNow = s.lineage ?? ''
  if (linNow !== '' && (pokedex[linNow] ?? null) == null) {
    pokedex[linNow] = {
      seen: true,
      count: 1,
      first_seen_at: s.created_at,
      shiny_seen: s.is_shiny,
      shiny_count: s.is_shiny ? 1 : 0,
    }
  }
  if (linNow !== '' && s.is_shiny === true && (pokedex[linNow]?.shiny_seen ?? false) === false) {
    const pd = pokedex[linNow]
    if (pd) {
      pd.shiny_seen = true
      pd.shiny_count = (pd.shiny_count ?? 0) + 1
    }
  }
  if (s.is_shiny === true && ls.total_shinies === 0) {
    ls.total_shinies = 1
    ls.first_shiny_at ??= s.created_at
  }
}

// ── Lineage assignment (sticky) ──
function assignLineage(c: TickCtx): void {
  const { s, pokedex, decisions, now } = c
  let lineage: string = s.lineage ?? ''
  if (!lineage) {
    lineage = decisions.starter as string
    s.lineage = lineage
    const pd = (pokedex[lineage] ??= {
      seen: false,
      shiny_seen: false,
      count: 0,
      shiny_count: 0,
      first_seen_at: null,
    })
    pd.seen = true
    pd.count = (pd.count ?? 0) + 1
    pd.first_seen_at ??= now
  }
  c.lineage = lineage
}

// ── Clamp current_level DOWN to what total_xp supports (never up here) ──
function clampLevelToXp(c: TickCtx): void {
  const { s, thresholds } = c
  const expectedLevel = levelFromXp(thresholds, s.total_xp ?? 0)
  if ((s.current_level ?? 0) > expectedLevel) {
    s.current_level = expectedLevel
    s.evolution_flash_remaining = 0
  }
  c.isShiny = s.is_shiny ?? false
  c.prevLevel = s.current_level ?? 0
}

// ── Per-tick delta + per-turn credit accumulator ──
// Anti-burst gate: tokens are only credited to XP when >= 30 s elapsed since the
// last credit (gapS), and each credit is capped at TICK_CAP=10000 tokens — the
// rest stays in sess.pending_tokens for the next eligible tick. This stops a
// single huge context jump (or a flurry of fast ticks) from minting a giant XP
// spike; it matches the bash tick's accumulator behavior byte-for-byte.
function accumulateTokenDelta(c: TickCtx): void {
  const { s, sid, currentTokens, nowEpoch } = c
  const sessions = (s.sessions ??= {})
  const sess = (sessions[sid] ??= {})
  const prevTokens = sess.last_tick_tokens ?? sess.max_context_tokens ?? 0
  const rawDelta = currentTokens > prevTokens ? currentTokens - prevTokens : 0
  let pending = (sess.pending_tokens ?? 0) + rawDelta
  const lastCreditAt = sess.last_xp_credit_at ?? 0
  const gapS = nowEpoch - lastCreditAt
  let delta = 0
  const TICK_CAP = 10000
  if (gapS >= 30 && pending > 0) {
    delta = pending > TICK_CAP ? TICK_CAP : pending
    pending -= delta
    sess.last_xp_credit_at = nowEpoch
  }
  sess.pending_tokens = pending
  c.sess = sess
  c.rawDelta = rawDelta
  c.delta = delta
}

// ── Multipliers ── (bash pre-rounds used_pct to an integer before passing it,
// so xpMultiplier/typeMatchMultiplier's Math.round is a no-op and matches the
// bash fallback's printf '%.0f' rounding exactly.)
function computeMultipliers(c: TickCtx): void {
  const { s, data, now, usedPct, lineage, delta } = c
  const xpMult = xpMultiplier(usedPct)
  const typeMatch = typeMatchMultiplier(lineage, usedPct == null ? 50 : usedPct)

  const today = now.slice(0, 10)
  let dailyMult = 1.0
  if ((s.last_daily_bonus_date ?? '') !== today) {
    dailyMult = 1.5
    s.last_daily_bonus_date = today
  }

  const pctInt = Math.round(usedPct ?? 0)
  if (pctInt >= 90) s.high_context_streak = (s.high_context_streak ?? 0) + 1
  else s.high_context_streak = 0
  let statusMult = 1.0
  if ((s.high_context_streak ?? 0) >= 5) {
    s.status = 'tired'
    statusMult = 0.75
  } else {
    s.status = 'ok'
    statusMult = 1.0
  }

  const heldItem: string = s.held_item ?? ''
  let heldMult = 1.0
  if (heldItem) heldMult = Number(data.items?.[heldItem]?.effect_xp_mult ?? 1.0)

  const injuredTicks = s.injured_ticks_remaining ?? 0
  let injuredMult = 1.0
  if (injuredTicks > 0) {
    injuredMult = 0.75
    s.injured_ticks_remaining = injuredTicks - 1
    if (heldItem === 'oran_berry') {
      s.held_item = null
      s.injured_ticks_remaining = 0
      injuredMult = 1.0
    }
  }

  const shinyHunter = data.shiny_hunter_mode === true

  // Season (month/day from `now`)
  const d = new Date(now)
  const curMonth = d.getUTCMonth() + 1
  const curDay = d.getUTCDate()
  let seasonMult = 1.0
  for (const season of Object.values(data.seasons ?? {})) {
    if (
      curMonth === season.month &&
      curDay >= (season.day_start ?? Infinity) &&
      curDay <= (season.day_end ?? -Infinity)
    ) {
      seasonMult = Number(season.boost_mult_xp ?? 1.0)
      break
    }
  }

  let weightedDelta = 0
  if (!shinyHunter) {
    // Product order matches the bash tick exactly (printf chain): each factor is
    // applied left-to-right and the result is capped at 2.0 before truncation.
    // Reordering would change nothing mathematically here, but the cap + trunc
    // sequence and the toFixed(1) snapshots below depend on this exact pipeline.
    let m = xpMult * typeMatch * dailyMult * statusMult * heldMult * injuredMult * seasonMult
    if (m > 2.0) m = 2.0
    weightedDelta = Math.trunc(delta * m)
  }

  // Stored as strings, matching the bash printf values (e.g. "2.0", "0.75").
  s.last_xp_multipliers = {
    context: xpMult.toFixed(1),
    type_match: typeMatch.toFixed(1),
    daily_bonus: dailyMult.toFixed(1),
    status: statusMult === 0.75 ? '0.75' : '1.0',
  }

  c.d = d
  c.xpMult = xpMult
  c.typeMatch = typeMatch
  c.dailyMult = dailyMult
  c.statusMult = statusMult
  c.heldMult = heldMult
  c.injuredMult = injuredMult
  c.seasonMult = seasonMult
  c.shinyHunter = shinyHunter
  c.weightedDelta = weightedDelta
}

// ── Random events (resolved upstream via `decisions`) ──
function applyRandomEvents(c: TickCtx): void {
  const { s, data, now, decisions } = c
  if (decisions.berry.fired) {
    // fired implies the index was rolled against this pool — but guard rather
    // than assert: an empty pool simply no-ops the event instead of throwing.
    const b = (data.berries ?? [])[decisions.berry.index]
    if (b) {
      s.total_xp = (s.total_xp ?? 0) + (b.xp_bonus ?? 0)
      s.recent_events = prepend10(s.recent_events, {
        type: 'berry',
        id: b.id,
        name: b.name,
        emoji: b.emoji,
        xp: b.xp_bonus,
        at: now,
      })
    }
  }
  if (decisions.encounter.fired) {
    // fired implies the index was rolled against this pool — but guard rather
    // than assert: an empty pool simply no-ops the encounter (last block here).
    const w = (data.wild_pool ?? [])[decisions.encounter.index]
    if (!w) return
    const wild = (s.pokedex_wild ??= {})
    wild[w.id] = {
      count: (wild[w.id]?.count ?? 0) + 1,
      first_seen_at: wild[w.id]?.first_seen_at ?? now,
      last_seen_at: now,
    }
    s.recent_events = prepend10(s.recent_events, { type: 'encounter', id: w.id, at: now })

    if (decisions.battle.fired) {
      const ownLevel = s.current_level ?? 0
      const wildLevel = decisions.battle.wild_level
      const battleWon = ownLevel >= wildLevel - 3
      if (battleWon) {
        const bonusXp = Math.trunc((decisions.battle.bonus_xp_raw * wildLevel) / 25)
        s.total_xp = (s.total_xp ?? 0) + bonusXp
        s.recent_events = prepend10(s.recent_events, {
          type: 'battle_won',
          id: w.id,
          wild_level: wildLevel,
          xp: bonusXp,
          at: now,
        })
      } else {
        s.injured_ticks_remaining = data.battle_injured_ticks ?? 5
        s.recent_events = prepend10(s.recent_events, {
          type: 'battle_lost',
          id: w.id,
          wild_level: wildLevel,
          at: now,
        })
      }
    }

    if (decisions.item.fired) {
      // jq `.items | keys` is sorted lexicographically — match it (the index
      // was rolled against the same sorted length on the engine side).
      const itemKeys = Object.keys(data.items ?? {}).sort()
      // index rolled against this same sorted-keys length — guard, don't assert.
      const itemId = itemKeys[decisions.item.index]
      if (itemId) {
        const inv = (s.items ??= {})
        inv[itemId] = (inv[itemId] ?? 0) + 1
        s.recent_events = prepend10(s.recent_events, {
          type: 'item',
          id: itemId,
          name: data.items?.[itemId]?.name,
          emoji: data.items?.[itemId]?.emoji,
          at: now,
        })
      }
    }
  }
}

// ── Apply credited XP + session bookkeeping + baseline ──
function creditXp(c: TickCtx): void {
  const { s, ls, sess, now, currentTokens, weightedDelta, rawDelta } = c
  s.total_xp = (s.total_xp ?? 0) + weightedDelta
  ls.total_tokens = (ls.total_tokens ?? 0) + rawDelta
  sess.first_seen ??= now
  sess.last_seen = now
  sess.max_context_tokens =
    (sess.max_context_tokens ?? 0) > currentTokens ? sess.max_context_tokens : currentTokens
  sess.last_tick_tokens = currentTokens
  s.last_updated = now
  if (!sess.baseline) {
    sess.baseline = {
      total_xp: s.total_xp - weightedDelta,
      friendship: s.friendship ?? 0,
      lifetime_tokens: ls.total_tokens - rawDelta,
      lineage: s.lineage,
      current_level: s.current_level,
      evolution_count: (s.evolution_history ?? []).length,
      badge_count: (s.badges ?? []).length,
      pokedex_wild_count: Object.keys(s.pokedex_wild ?? {}).length,
      games_won: ls.games_won ?? 0,
    }
  }
}

// ── Level-up / evolution ──
function resolveLevelUpAndEvolution(c: TickCtx): void {
  const { s, data, now, decisions, pokedex, ls, lineage, prevLevel, maxLevel, d } = c
  let isShiny = c.isShiny
  // creditXp() ran first, so s.total_xp is always assigned here; the `!` keeps
  // the strict-typing edge the original carried after that in-scope assignment.
  const totalXp = s.total_xp!
  const newLevel = levelFromXp(c.thresholds, totalXp)

  if (newLevel > prevLevel) {
    if (prevLevel === 0 && newLevel >= 1) {
      isShiny = decisions.shiny
      s.is_shiny = isShiny
      if (isShiny) {
        const pd = (pokedex[lineage] ??= {
          seen: false,
          shiny_seen: false,
          count: 0,
          shiny_count: 0,
          first_seen_at: null,
        })
        pd.shiny_seen = true
        pd.shiny_count = (pd.shiny_count ?? 0) + 1
        ls.total_shinies = (ls.total_shinies ?? 0) + 1
        ls.first_shiny_at ??= now
      }
    }
    if (lineage === 'eevee' && prevLevel < 30 && newLevel >= 30) {
      const rules = data.eevee_evolution_rules ?? {}
      let chosenForm = ''
      let usedStone = ''
      for (const stone of ['fire_stone', 'water_stone', 'thunder_stone']) {
        if ((s.items?.[stone] ?? 0) > 0) {
          usedStone = stone
          chosenForm = rules[stone] ?? ''
          break
        }
      }
      if (!chosenForm) {
        const friendship = s.friendship ?? 0
        const threshold = data.eevee_friendship_threshold ?? 50
        const hour = d.getUTCHours()
        if (friendship >= threshold) {
          chosenForm = (hour >= 6 && hour < 18 ? rules.day_default : rules.night_default) ?? ''
        } else {
          const fallback =
            ['fire_stone', 'water_stone', 'thunder_stone'][decisions.eevee_fallback_index] ?? ''
          chosenForm = rules[fallback] ?? ''
        }
      }
      s.eevee_form = chosenForm
      if (usedStone) {
        // usedStone was found in s.items above (> 0) — the entry exists.
        const inv = s.items as Record<string, number>
        inv[usedStone]! -= 1
        if (inv[usedStone]! <= 0) delete inv[usedStone]
      }
    }

    // Log stage TRANSITIONS in (prevLevel, newLevel]. Eevee L30: log once.
    const stages: StageDef[] = data.lineages?.[lineage]?.stages ?? []
    const transitions = stages
      .filter(st => st.min_level > prevLevel && st.min_level <= newLevel)
      .map(st => st.min_level)
    let stageChanged = false
    let transitionCount = 0
    let eeveeLogged = false
    for (const t of transitions) {
      if (lineage === 'eevee' && t === 30 && eeveeLogged) continue
      const evoName = evoField(data, s, lineage, t, 'name')
      s.evolution_history = [
        ...(s.evolution_history ?? []),
        { level: t, name: evoName, evolved_at: now, is_shiny: isShiny },
      ]
      stageChanged = true
      transitionCount += 1
      if (lineage === 'eevee' && t === 30) eeveeLogged = true
    }
    if (transitionCount > 0) ls.total_evolutions = (ls.total_evolutions ?? 0) + transitionCount
    ls.max_level = (ls.max_level ?? 0) > newLevel ? ls.max_level : newLevel
    const flashValue = stageChanged ? 3 : 0
    s.current_level = newLevel
    if (flashValue > 0) s.evolution_flash_remaining = flashValue
    // (else: leave evolution_flash_remaining as-is, matching jq)

    if (prevLevel < maxLevel && newLevel >= maxLevel) {
      Object.assign(s, archiveToTeam(s, now))
    }
  } else {
    const flash = s.evolution_flash_remaining ?? 0
    if (flash > 0) s.evolution_flash_remaining = flash - 1
  }

  c.isShiny = isShiny
}

// ── Per-tick counters ──
function bumpPerTickCounters(c: TickCtx): void {
  const { s, lineage } = c
  s.animation_frame_index = (s.animation_frame_index ?? 0) + 1
  if (lineage && lineage !== 'null') s.friendship = (s.friendship ?? 0) + 1
}

// ── Badges ──
function awardBadges(c: TickCtx): void {
  Object.assign(c.s, checkBadges(c.s, c.now, c.data))
}

// ── Session cleanup (drop sessions older than 30 days, keep current) ──
function pruneOldSessions(c: TickCtx): void {
  const { s, sid, nowEpoch } = c
  const cutoff = new Date(nowEpoch * 1000 - 30 * 86400 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
  const kept: Record<string, SessionEntry> = {}
  for (const [k, v] of Object.entries(s.sessions ?? {})) {
    if (k === sid || (v.last_seen ?? '') >= cutoff) kept[k] = v
  }
  s.sessions = kept
}

export function tick(input: TickInput): { state: PokemonState } {
  const { data, now, now_epoch, session_id: sid, current_tokens, decisions } = input
  const thresholds: number[] = data.thresholds ?? []
  const s: PokemonState = clone(input.state)

  const c: TickCtx = {
    s,
    data,
    now,
    nowEpoch: now_epoch,
    sid,
    currentTokens: current_tokens,
    usedPct: input.used_pct == null ? null : Number(input.used_pct),
    decisions,
    thresholds,
    maxLevel: thresholds.length - 1,
  } as TickCtx

  migrateSchema(c)
  backfillRetroactive(c)
  assignLineage(c)
  clampLevelToXp(c)
  accumulateTokenDelta(c)
  computeMultipliers(c)
  applyRandomEvents(c)
  creditXp(c)
  resolveLevelUpAndEvolution(c)
  bumpPerTickCounters(c)
  awardBadges(c)
  pruneOldSessions(c)

  return { state: s }
}
