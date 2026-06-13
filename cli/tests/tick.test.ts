// Engine tick — battle + Eevee-evolution branches (Phase R3d-3). These are
// gated by injected decisions here because their inputs (wild_level / bonus_xp
// from $RANDOM) make a bash differential impractical; the rest of the tick is
// diffed against bash in tests/cli/tick-bridge.bats.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { tick, type TickDecisions } from '../src/tick.js'

const here = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(here, '..', '..', 'lib', 'data.default.json'), 'utf8'))
const thresholds: number[] = data.thresholds
const NOW = '2026-06-11T12:00:00Z' // hour 12 → "day" for Eevee
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseState(over: Record<string, any> = {}): any {
  return {
    version: 2,
    lineage: 'fire',
    is_shiny: false,
    current_level: 50,
    total_xp: thresholds[50] + 1000,
    evolution_history: [{ level: 1, name: 'x' }],
    eevee_form: null,
    // no credit: current_tokens == last_tick_tokens
    sessions: { s1: { last_tick_tokens: 50000, last_seen: NOW, first_seen: NOW, last_xp_credit_at: EPOCH } },
    badges: [],
    team: [],
    pc_storage: [],
    pokedex: { fire: { seen: true, count: 1, shiny_seen: false, shiny_count: 0 } },
    pokedex_wild: {},
    items: {},
    friendship: 10,
    lifetime_stats: { total_tokens: 0, total_evolutions: 1, total_shinies: 0, max_level: 50, lineages_completed: [] },
    last_daily_bonus_date: '2026-06-11',
    created_at: '2026-06-01T00:00:00Z',
    ...over,
  }
}

function runTick(state: unknown, decisions: TickDecisions): any { // eslint-disable-line @typescript-eslint/no-explicit-any
  return tick({
    state,
    data,
    now: NOW,
    now_epoch: EPOCH,
    session_id: 's1',
    current_tokens: 50000,
    used_pct: 20,
    decisions,
  }).state
}

describe('tick — battle branch', () => {
  it('battle won adds scaled bonus XP + a battle_won event', () => {
    const dec = { ...DEC_OFF, encounter: { fired: true, index: 0 }, battle: { fired: true, wild_level: 30, bonus_xp_raw: 1000 } }
    const out = runTick(baseState(), dec)
    // bonus = floor(1000 * 30 / 25) = 1200
    expect(out.total_xp).toBe(thresholds[50] + 1000 + 1200)
    expect(out.recent_events[0]).toMatchObject({ type: 'battle_won', wild_level: 30, xp: 1200 })
    expect(out.injured_ticks_remaining ?? 0).toBe(0)
  })

  it('battle lost sets injured ticks + a battle_lost event (no XP)', () => {
    // own level 5 vs wild 40 → lost
    const dec = { ...DEC_OFF, encounter: { fired: true, index: 0 }, battle: { fired: true, wild_level: 40, bonus_xp_raw: 1000 } }
    const out = runTick(baseState({ current_level: 5, total_xp: thresholds[5] + 100, lifetime_stats: { max_level: 5, total_tokens: 0, lineages_completed: [] } }), dec)
    expect(out.injured_ticks_remaining).toBe(data.battle_injured_ticks ?? 5)
    expect(out.recent_events[0]).toMatchObject({ type: 'battle_lost', wild_level: 40 })
  })
})

describe('tick — Eevee evolution at Lv.30', () => {
  // Push from Lv.29 to Lv.30 by crediting a tiny amount (total_xp just below thr30).
  function eeveeState(over: Record<string, unknown> = {}): unknown {
    return baseState({
      lineage: 'eevee',
      current_level: 29,
      total_xp: thresholds[30] - 100,
      evolution_history: [{ level: 1, name: 'Évoli' }],
      pokedex: { eevee: { seen: true, count: 1, shiny_seen: false, shiny_count: 0 } },
      lifetime_stats: { total_tokens: 0, total_evolutions: 1, total_shinies: 0, max_level: 29, lineages_completed: [] },
      sessions: { s1: { last_tick_tokens: 0, last_seen: NOW, first_seen: NOW } }, // credit fires → crosses Lv.30
      ...over,
    })
  }

  it('held stone wins (consumed) → form from the stone', () => {
    const out = runTick(eeveeState({ items: { water_stone: 1 } }), DEC_OFF)
    expect(out.eevee_form).toBe('vaporeon')
    expect(out.items.water_stone).toBeUndefined() // consumed (1→0→deleted)
    expect(out.current_level).toBeGreaterThanOrEqual(30)
  })

  it('no stone + friendship ≥ threshold + daytime → day_default (espeon)', () => {
    const out = runTick(eeveeState({ friendship: 999 }), DEC_OFF)
    expect(out.eevee_form).toBe('espeon')
  })

  it('no stone + low friendship → fallback stone form (no consumption)', () => {
    // eevee_fallback_index 1 → water_stone → vaporeon
    const out = runTick(eeveeState({ friendship: 0 }), { ...DEC_OFF, eevee_fallback_index: 1 })
    expect(out.eevee_form).toBe('vaporeon')
  })
})
