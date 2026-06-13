// trade pull (Phase R3d-4b). The trade *pull* draws a random level/shiny that
// can't be data-forced, so it isn't byte-diffed against bash in bats — covered
// here with injected decisions (engine is pure). The deterministic paths
// (cooldown, game) are diffed byte-exact in tests/cli/cmd-rng-bridge.bats.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runCommand } from '../src/commands/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8'))
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

const NOW = '2026-06-11T12:00:00Z'
const data = {
  language: 'en',
  wild_pool: [
    { id: 'pikachu', type: 'Electric', national_dex: 25, name_fr: 'Pikachu', name_en: 'Pikachu' },
  ],
  trade_cooldown_hours: 24,
}

function trade(state: unknown, decisions: unknown, args: string[] = ['Ash']) {
  return runCommand({
    name: 'trade',
    args,
    state,
    data,
    locale: en,
    now: NOW,
    nowEpoch: 0,
    decisions,
  } as never)!
}

describe('runCommand: trade pull', () => {
  it('adds a wild trade entry to the team (deterministic given decisions)', () => {
    const r = trade(
      { team: [], pc_storage: [] },
      { pool_idx: 0, trade_level: 20, trade_shiny: false },
    )
    expect(r.stateChanged).toBe(true)
    expect(r.state.team).toHaveLength(1)
    const e = r.state.team[0]
    expect(e.lineage).toBe('trade-pikachu')
    expect(e.level).toBe(20)
    expect(e.is_shiny).toBe(false)
    expect(e.max_stage).toBe('Pikachu')
    expect(e.source).toBe('trade')
    expect(r.state.last_trade_at).toBe(NOW)
    expect(r.state.recent_events[0]).toMatchObject({
      type: 'trade',
      id: 'pikachu',
      name: 'Pikachu',
      at: NOW,
    })
    const out = strip(r.output)
    expect(out).toContain('#025 Pikachu Lv.20')
    expect(out).toContain('(par Ash)')
  })

  it('marks a shiny pull and routes a full team to the PC', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({
      lineage: 'fire',
      level: 50,
      max_stage: `M${i}`,
    }))
    const r = trade(
      { team: six, pc_storage: [] },
      { pool_idx: 0, trade_level: 30, trade_shiny: true },
    )
    expect(r.state.team).toHaveLength(6) // unchanged
    expect(r.state.pc_storage).toHaveLength(1)
    expect(r.state.pc_storage[0].is_shiny).toBe(true)
    expect(strip(r.output)).toContain('★')
  })

  it('respects the cooldown (no pull, no state change)', () => {
    const lastEpoch = Math.floor(Date.parse('2026-06-11T01:00:00Z') / 1000)
    void lastEpoch
    const nowEpoch = Math.floor(Date.parse(NOW) / 1000)
    const r = runCommand({
      name: 'trade',
      args: ['Ash'],
      state: { team: [], pc_storage: [], last_trade_at: '2026-06-11T01:00:00Z' },
      data,
      locale: en,
      now: NOW,
      nowEpoch,
      decisions: { pool_idx: 0, trade_level: 20, trade_shiny: false },
    } as never)!
    expect(r.stateChanged).toBe(false)
    expect(strip(r.output)).toContain('13') // 24h - 11h elapsed = 13h remaining
  })
})
