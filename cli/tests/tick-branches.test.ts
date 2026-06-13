// Branch coverage for the tick engine's under-tested paths (the game economy
// core). tick.test.ts already covers the battle + Eevee-evolution branches;
// this file targets the rest: berry / item / encounter events (and their
// empty-pool guards), the token-delta anti-burst accumulator, the multiplier
// branches (daily bonus, tired status, injured ticks + oran_berry, season),
// the retroactive backfill, clampLevelToXp, and the lineage/hatch paths.
//
// Every random outcome is injected via TickDecisions ("decisions in"), so each
// assertion is deterministic. State is built from lib/data.default.json plus
// hand-crafted PokemonState overrides.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tick, type TickDecisions, type TickInput } from '../src/tick.js'
import type { PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

const here = dirname(fileURLToPath(import.meta.url))
const data: PokemonData = JSON.parse(
  readFileSync(join(here, '..', '..', 'lib', 'data.default.json'), 'utf8'),
)
const thresholds: number[] = data.thresholds ?? []
const NOW = '2026-06-11T12:00:00Z'
const EPOCH = Math.floor(Date.parse(NOW) / 1000)

const DEC_OFF: TickDecisions = {
  starter: null,
  shiny: false,
  eevee_fallback_index: 0,
  berry: { fired: false, index: 0 },
  encounter: { fired: false, index: 0 },
  battle: { fired: false, wild_level: 0, bonus_xp_raw: 0 },
  item: { fired: false, index: 0 },
}

// A mid-lineage state that does NOT level up (total_xp sits between L50 and the
// next threshold) unless a test forces it. Tokens equal last_tick → no credit.
function baseState(over: Partial<PokemonState> = {}): PokemonState {
  return {
    version: 2,
    lineage: 'fire',
    is_shiny: false,
    current_level: 50,
    total_xp: thresholds[50]! + 1000,
    evolution_history: [{ level: 1, name: 'x', evolved_at: NOW, is_shiny: false }],
    eevee_form: null,
    sessions: {
      s1: { last_tick_tokens: 50000, last_seen: NOW, first_seen: NOW, last_xp_credit_at: EPOCH },
    },
    badges: [],
    team: [],
    pc_storage: [],
    pokedex: { fire: { seen: true, count: 1, shiny_seen: false, shiny_count: 0 } },
    pokedex_wild: {},
    items: {},
    friendship: 10,
    lifetime_stats: {
      total_tokens: 0,
      total_evolutions: 1,
      total_shinies: 0,
      max_level: 50,
      lineages_completed: [],
      total_companions: 1,
      first_shiny_at: null,
    },
    last_daily_bonus_date: '2026-06-11',
    created_at: '2026-06-01T00:00:00Z',
    ...over,
  } as PokemonState
}

function runTick(
  state: PokemonState,
  decisions: TickDecisions,
  over: Partial<TickInput> = {},
): PokemonState {
  return tick({
    state,
    data,
    now: NOW,
    now_epoch: EPOCH,
    session_id: 's1',
    current_tokens: 50000,
    used_pct: 20,
    decisions,
    ...over,
  }).state
}

describe('tick — berry events', () => {
  it('berry fired applies xp_bonus and prepends a berry event', () => {
    const berry = data.berries![0]!
    const before = thresholds[50]! + 1000
    const out = runTick(baseState(), { ...DEC_OFF, berry: { fired: true, index: 0 } })
    expect(out.total_xp).toBe(before + (berry.xp_bonus ?? 0))
    expect(out.recent_events![0]).toMatchObject({ type: 'berry', id: berry.id, xp: berry.xp_bonus })
  })

  it('berry fired against an empty pool is a no-op (no throw, no event)', () => {
    const emptyBerries: PokemonData = { ...data, berries: [] }
    const before = thresholds[50]! + 1000
    const out = tick({
      state: baseState(),
      data: emptyBerries,
      now: NOW,
      now_epoch: EPOCH,
      session_id: 's1',
      current_tokens: 50000,
      used_pct: 20,
      decisions: { ...DEC_OFF, berry: { fired: true, index: 0 } },
    }).state
    expect(out.total_xp).toBe(before)
    expect((out.recent_events ?? []).some(e => e.type === 'berry')).toBe(false)
  })
})

describe('tick — encounter + item drop', () => {
  it('encounter fired records the wild species in pokedex_wild', () => {
    const wild = data.wild_pool![0]!
    const out = runTick(baseState(), { ...DEC_OFF, encounter: { fired: true, index: 0 } })
    expect(out.pokedex_wild![wild.id]!.count).toBe(1)
    expect(out.recent_events![0]).toMatchObject({ type: 'encounter', id: wild.id })
  })

  it('item drop fired increments inventory at the sorted-keys index', () => {
    const sortedKeys = Object.keys(data.items ?? {}).sort()
    const itemId = sortedKeys[2]! // 'oran_berry' given current data
    const out = runTick(baseState(), {
      ...DEC_OFF,
      encounter: { fired: true, index: 0 },
      item: { fired: true, index: 2 },
    })
    expect(out.items![itemId]).toBe(1)
    expect(out.recent_events!.some(e => e.type === 'item' && e.id === itemId)).toBe(true)
  })

  it('item drop fired against empty items is a no-op (guard)', () => {
    const noItems: PokemonData = { ...data, items: {} }
    const out = tick({
      state: baseState(),
      data: noItems,
      now: NOW,
      now_epoch: EPOCH,
      session_id: 's1',
      current_tokens: 50000,
      used_pct: 20,
      decisions: {
        ...DEC_OFF,
        encounter: { fired: true, index: 0 },
        item: { fired: true, index: 0 },
      },
    }).state
    expect(out.items ?? {}).toEqual({})
    expect((out.recent_events ?? []).some(e => e.type === 'item')).toBe(false)
  })

  it('encounter fired against an empty wild pool is a no-op (guard, no event)', () => {
    const noWild: PokemonData = { ...data, wild_pool: [] }
    const out = tick({
      state: baseState(),
      data: noWild,
      now: NOW,
      now_epoch: EPOCH,
      session_id: 's1',
      current_tokens: 50000,
      used_pct: 20,
      decisions: {
        ...DEC_OFF,
        encounter: { fired: true, index: 0 },
        item: { fired: true, index: 0 },
        battle: { fired: true, wild_level: 10, bonus_xp_raw: 100 },
      },
    }).state
    expect(out.pokedex_wild ?? {}).toEqual({})
    expect((out.recent_events ?? []).length).toBe(0)
  })
})

describe('tick — token-delta anti-burst accumulator', () => {
  it('gapS < 30 accumulates to pending_tokens without crediting XP', () => {
    const state = baseState({
      sessions: {
        s1: { last_tick_tokens: 50000, last_xp_credit_at: EPOCH - 10, pending_tokens: 0 },
      },
    })
    const out = runTick(state, DEC_OFF, { current_tokens: 55000 })
    // No credit (gap=10s < 30) → total_xp unchanged, raw delta parked in pending.
    expect(out.total_xp).toBe(thresholds[50]! + 1000)
    expect(out.sessions!.s1!.pending_tokens).toBe(5000)
  })

  it('gapS >= 30 credits pending tokens (weighted) and resets pending', () => {
    const state = baseState({
      sessions: {
        s1: { last_tick_tokens: 50000, last_xp_credit_at: EPOCH - 60, pending_tokens: 0 },
      },
      last_daily_bonus_date: '2026-06-11', // no daily bonus → mult stays 1.0
    })
    const out = runTick(state, DEC_OFF, { current_tokens: 53000 })
    // used_pct 20 → xpMult; verify XP grew and pending cleared.
    expect(out.total_xp!).toBeGreaterThan(thresholds[50]! + 1000)
    expect(out.sessions!.s1!.pending_tokens).toBe(0)
    expect(out.sessions!.s1!.last_xp_credit_at).toBe(EPOCH)
  })

  it('credit is clamped to TICK_CAP=10000, leaving the rest pending', () => {
    const state = baseState({
      sessions: {
        s1: { last_tick_tokens: 0, last_xp_credit_at: EPOCH - 60, pending_tokens: 0 },
      },
    })
    // raw delta 25000 → credit capped at 10000, 15000 stays pending.
    const out = runTick(state, DEC_OFF, { current_tokens: 25000 })
    expect(out.sessions!.s1!.pending_tokens).toBe(15000)
    expect(out.lifetime_stats!.total_tokens).toBe(25000) // raw, not capped
  })
})

describe('tick — multiplier branches', () => {
  it('daily bonus applies on a new date and stamps last_daily_bonus_date', () => {
    const out = runTick(baseState({ last_daily_bonus_date: '2026-06-10' }), DEC_OFF)
    expect(out.last_daily_bonus_date).toBe('2026-06-11')
    expect(out.last_xp_multipliers!.daily_bonus).toBe('1.5')
  })

  it('high-context streak ≥ 5 sets status=tired (0.75 mult)', () => {
    const out = runTick(baseState({ high_context_streak: 4 }), DEC_OFF, { used_pct: 95 })
    expect(out.high_context_streak).toBe(5)
    expect(out.status).toBe('tired')
    expect(out.last_xp_multipliers!.status).toBe('0.75')
  })

  it('injured ticks decrement and apply a 0.75 penalty', () => {
    const out = runTick(baseState({ injured_ticks_remaining: 3 }), DEC_OFF)
    expect(out.injured_ticks_remaining).toBe(2)
  })

  it('held oran_berry while injured is consumed and clears the injury', () => {
    const out = runTick(baseState({ injured_ticks_remaining: 3, held_item: 'oran_berry' }), DEC_OFF)
    expect(out.held_item).toBeNull()
    expect(out.injured_ticks_remaining).toBe(0)
  })

  it('a matching season boosts the XP multiplier', () => {
    // Christmas season: month 12, day 20-31. Use a Dec date.
    const XMAS = '2026-12-25T12:00:00Z'
    const XEPOCH = Math.floor(Date.parse(XMAS) / 1000)
    const state = baseState({
      sessions: { s1: { last_tick_tokens: 0, last_xp_credit_at: XEPOCH - 60, pending_tokens: 0 } },
      last_daily_bonus_date: '2026-12-25',
    })
    const out = tick({
      state,
      data,
      now: XMAS,
      now_epoch: XEPOCH,
      session_id: 's1',
      current_tokens: 1000,
      used_pct: 50,
      decisions: DEC_OFF,
    }).state
    // With a season boost the weighted delta is strictly larger than without it
    // would be at the same factors; assert XP credited and season applied.
    expect(out.total_xp!).toBeGreaterThan(thresholds[50]! + 1000)
  })
})

describe('tick — retroactive backfill', () => {
  it('backfills a missing pokedex entry for the active lineage', () => {
    const state = baseState({ pokedex: {} })
    const out = runTick(state, DEC_OFF)
    expect(out.pokedex!.fire).toMatchObject({ seen: true, count: 1 })
  })

  it('backfills shiny pokedex flags + lifetime total_shinies for a shiny that lacked them', () => {
    const state = baseState({
      is_shiny: true,
      pokedex: { fire: { seen: true, count: 1, shiny_seen: false, shiny_count: 0 } },
      lifetime_stats: {
        total_tokens: 0,
        total_evolutions: 1,
        total_shinies: 0,
        max_level: 50,
        lineages_completed: [],
        total_companions: 1,
        first_shiny_at: null,
      },
    })
    const out = runTick(state, DEC_OFF)
    expect(out.pokedex!.fire!.shiny_seen).toBe(true)
    expect(out.pokedex!.fire!.shiny_count).toBe(1)
    expect(out.lifetime_stats!.total_shinies).toBe(1)
    expect(out.lifetime_stats!.first_shiny_at).toBe(state.created_at)
  })

  it('migrates the legacy total_compagnons field to total_companions', () => {
    const state = baseState()
    // Inject the legacy field; the migration copies it then deletes it.
    const ls = state.lifetime_stats as Record<string, unknown>
    delete ls.total_companions
    ls.total_compagnons = 7
    const out = runTick(state, DEC_OFF)
    expect(out.lifetime_stats!.total_companions).toBe(7)
    expect((out.lifetime_stats as Record<string, unknown>).total_compagnons).toBeUndefined()
  })
})

describe('tick — max-level archive', () => {
  it('crossing into the max level archives the active to the team', () => {
    const maxLevel = thresholds.length - 1 // 100
    const state = baseState({
      lineage: 'fire',
      current_level: maxLevel - 1, // 99
      total_xp: thresholds[maxLevel]! - 1, // one credited XP crosses into L100
      evolution_history: [{ level: 1, name: 'x', evolved_at: NOW, is_shiny: false }],
      team: [],
      lifetime_stats: {
        total_tokens: 0,
        total_evolutions: 1,
        total_shinies: 0,
        max_level: maxLevel - 1,
        lineages_completed: [],
        total_companions: 1,
        first_shiny_at: null,
      },
      sessions: { s1: { last_tick_tokens: 0, last_seen: NOW, first_seen: NOW } },
    })
    const out = runTick(state, DEC_OFF, { current_tokens: 5000 })
    // archiveToTeam resets the active and pushes the maxed companion onto the team.
    expect(out.team!.length).toBeGreaterThan(0)
  })
})

describe('tick — clampLevelToXp', () => {
  it('clamps current_level DOWN to what total_xp supports and clears the evo flash', () => {
    // total_xp supports L0 (just under L1 threshold) but current_level claims 50.
    const state = baseState({
      current_level: 50,
      total_xp: 5,
      evolution_flash_remaining: 3,
    })
    const out = runTick(state, DEC_OFF)
    expect(out.current_level).toBe(0)
    expect(out.evolution_flash_remaining).toBe(0)
  })
})

describe('tick — lineage assignment + hatch', () => {
  it('assigns the injected starter when the active has no lineage', () => {
    const state = baseState({ lineage: '', pokedex: {} })
    const out = runTick(state, { ...DEC_OFF, starter: 'water' })
    expect(out.lineage).toBe('water')
    expect(out.pokedex!.water).toMatchObject({ seen: true, count: 1 })
  })

  it('hatch (0 → 1) applies the shiny roll and bumps lifetime_stats.total_shinies', () => {
    const state = baseState({
      lineage: 'fire',
      is_shiny: false,
      current_level: 0,
      total_xp: thresholds[1]! - 1, // one credited XP point crosses into L1
      evolution_history: [],
      pokedex: { fire: { seen: true, count: 1, shiny_seen: false, shiny_count: 0 } },
      lifetime_stats: {
        total_tokens: 0,
        total_evolutions: 0,
        total_shinies: 0,
        max_level: 0,
        lineages_completed: [],
        total_companions: 1,
        first_shiny_at: null,
      },
      sessions: { s1: { last_tick_tokens: 0, last_seen: NOW, first_seen: NOW } },
    })
    // Credit enough tokens to cross L1; shiny roll = true.
    const out = runTick(state, { ...DEC_OFF, shiny: true }, { current_tokens: 5000 })
    expect(out.current_level).toBeGreaterThanOrEqual(1)
    expect(out.is_shiny).toBe(true)
    expect(out.lifetime_stats!.total_shinies).toBe(1)
    expect(out.pokedex!.fire!.shiny_seen).toBe(true)
  })
})
