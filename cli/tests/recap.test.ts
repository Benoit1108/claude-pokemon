// renderRecap session-scope math (Phase R3c slice 4). The R3a fixtures only
// exercise the deterministic no-active-session path (sessions:{}); the session
// path depends on the wall clock, so we lock its deltas/duration here with a
// fixed nowEpoch instead of a fixture.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderRecap, type RenderContext } from '../src/render/views.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const locale = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'fr.json'), 'utf8'))
const data = JSON.parse(readFileSync(join(root, 'lib', 'data.default.json'), 'utf8'))

const FIRST_SEEN = '2026-05-08T10:00:00Z'
const firstEpoch = Math.floor(Date.parse(FIRST_SEEN) / 1000)

function ctx(state: Record<string, unknown>, nowEpoch: number): RenderContext {
  return { state, data, locale, lang: 'fr', nowEpoch }
}

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

describe('renderRecap — session scope', () => {
  const state = {
    total_xp: 2_000_000,
    friendship: 50,
    current_level: 5,
    lifetime_stats: { total_tokens: 5000 },
    sessions: {
      s1: {
        first_seen: FIRST_SEEN,
        last_seen: '2026-05-08T12:05:00Z',
        baseline: { total_xp: 1_000_000, friendship: 10, lifetime_tokens: 1000, current_level: 3 },
      },
    },
    recent_events: [],
    evolution_history: [],
    badges: [],
  }

  it('renders duration, deltas and level progress with a fixed clock', () => {
    const out = strip(renderRecap(ctx(state, firstEpoch + 125 * 60), 'session')) // +2h05
    expect(out).toContain('2h05') // duration label
    expect(out).toContain('1 000 000') // xp gained (+delta)
    expect(out).toContain('+40') // friendship delta
    expect(out).toContain('4 000') // tokens consumed delta
    expect(out).toContain('Lv.3 → Lv.5') // level progress
  })

  it('falls back to the no-session line when sessions is empty', () => {
    const out = strip(renderRecap(ctx({ sessions: {} }, firstEpoch), 'session'))
    // matches the frozen fixture's content
    expect(out).toContain('RECAP')
    expect(out).not.toContain('2h')
  })

  it('shows minutes for short sessions', () => {
    const out = strip(renderRecap(ctx(state, firstEpoch + 45 * 60), 'session'))
    expect(out).toContain('45min')
  })

  it('excludes events/evolutions/badges with a MISSING timestamp (jq null semantics)', () => {
    const s = {
      ...state,
      recent_events: [{ type: 'item', name: 'ZZITEM', emoji: '🎁' /* no .at */ }],
      evolution_history: [{ level: 5, name: 'ZZEVO' /* no .evolved_at */ }],
      badges: [{ id: 'hatch' /* no .earned_at */ }],
    }
    const out = strip(renderRecap(ctx(s, firstEpoch + 60 * 60), 'session'))
    // all three sections should be empty (entries lack timestamps → excluded)
    expect(out).not.toContain('ZZITEM')
    expect(out).not.toContain('ZZEVO')
  })

  it('renders empty (not "null") for an event referencing an unknown wild id', () => {
    const s = {
      ...state,
      recent_events: [{ type: 'encounter', id: 'does-not-exist', at: '2026-05-08T11:00:00Z' }],
    }
    const out = strip(renderRecap(ctx(s, firstEpoch + 90 * 60), 'session'))
    expect(out).not.toContain('null')
  })
})
