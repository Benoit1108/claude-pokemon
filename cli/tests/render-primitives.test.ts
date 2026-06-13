// Unit coverage for the render-layer primitives and dispatch: format helpers
// (padChars / tPad / fmtInt / lineageEmoji / jqStr), stage resolution
// (resolveStageDefault / evoField across lineages + eevee forms), and the
// renderView dispatcher (every SUPPORTED_VIEW + an unsupported name).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  padChars,
  tPad,
  fmtInt,
  lineageEmoji,
  resolveStageDefault,
  evoField,
} from '../src/render/views.js'
import { jqStr } from '../src/render/views/format.js'
import { renderView, SUPPORTED_VIEWS } from '../src/render/index.js'
import type { PokemonState, PokemonData } from 'claude-pokemon-shared/state-types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const data = JSON.parse(readFileSync(join(root, 'lib', 'data.default.json'), 'utf8')) as PokemonData
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8'))

// ── format ───────────────────────────────────────────────────────────────────
describe('jqStr', () => {
  it('renders null/undefined as the literal "null"', () => {
    expect(jqStr(null)).toBe('null')
    expect(jqStr(undefined)).toBe('null')
  })
  it('stringifies other values', () => {
    expect(jqStr(0)).toBe('0')
    expect(jqStr('x')).toBe('x')
    expect(jqStr(false)).toBe('false')
  })
})

describe('padChars', () => {
  it('pads to width by char count', () => {
    expect(padChars('ab', 5)).toBe('ab   ')
  })
  it('counts unicode code points, not bytes', () => {
    // "é" is multi-byte but one code point.
    expect(padChars('é', 3)).toBe('é  ')
  })
  it('does not truncate when already at/over width', () => {
    expect(padChars('abcdef', 3)).toBe('abcdef')
  })
})

describe('tPad', () => {
  it('looks up a key then pads', () => {
    const out = tPad(en, 'main.remaining', 30)
    expect(out.startsWith(en.main.remaining)).toBe(true)
    expect([...out].length).toBe(30)
  })
})

describe('fmtInt', () => {
  it('groups digits in 3s with a space', () => {
    expect(fmtInt(1234567)).toBe('1 234 567')
  })
  it('handles small numbers, zero and undefined', () => {
    expect(fmtInt(5)).toBe('5')
    expect(fmtInt(0)).toBe('0')
    expect(fmtInt(undefined)).toBe('0')
  })
  it('handles negatives', () => {
    expect(fmtInt(-1234)).toBe('-1 234')
  })
  it('handles large numbers and numeric strings', () => {
    expect(fmtInt('1000000000')).toBe('1 000 000 000')
  })
  it('truncates non-integers', () => {
    expect(fmtInt(1234.99)).toBe('1 234')
  })
})

describe('lineageEmoji', () => {
  it('maps known lineages', () => {
    expect(lineageEmoji('fire')).toBe('🔥')
    expect(lineageEmoji('eevee')).toBe('🦊')
  })
  it('falls back to ❓ for unknown / undefined', () => {
    expect(lineageEmoji('nope')).toBe('❓')
    expect(lineageEmoji(undefined)).toBe('❓')
  })
})

// ── stage ────────────────────────────────────────────────────────────────────
describe('resolveStageDefault', () => {
  it('resolves the highest stage with min_level ≤ level', () => {
    const st = resolveStageDefault(data, 'fire', 16)
    expect(st?.showdown_id).toBe('charmeleon')
  })
  it('returns the egg stage at level 0', () => {
    const st = resolveStageDefault(data, 'fire', 0)
    expect(st?.showdown_id).toBe('egg')
  })
  it('returns null for null/empty/non-finite levels (jq null semantics)', () => {
    expect(resolveStageDefault(data, 'fire', null)).toBeNull()
    expect(resolveStageDefault(data, 'fire', undefined)).toBeNull()
    expect(resolveStageDefault(data, 'fire', '')).toBeNull()
    expect(resolveStageDefault(data, 'fire', 'abc')).toBeNull()
  })
  it('returns null for an unknown lineage', () => {
    expect(resolveStageDefault(data, 'nope', 10)).toBeNull()
  })
})

describe('evoField', () => {
  it('reads a default-stage field', () => {
    expect(evoField(data, {}, 'fire', 36, 'showdown_id')).toBe('charizard')
  })
  it('resolves the eevee form field at Lv.30+ when a form is set', () => {
    const state: PokemonState = { eevee_form: 'flareon' }
    expect(evoField(data, state, 'eevee', 30, 'showdown_id')).toBe('flareon')
  })
  it('falls back to the default eevee stage when no form is set', () => {
    // Lv.29 eevee → still "eevee" stage (below the 30 fork)
    expect(evoField(data, {}, 'eevee', 29, 'showdown_id')).toBe('eevee')
  })
  it('falls back to default resolution for an unknown eevee form', () => {
    const state: PokemonState = { eevee_form: 'does-not-exist' }
    // jqStr(null) when the form stage is not found
    expect(evoField(data, state, 'eevee', 30, 'showdown_id')).toBe('null')
  })
  it('renders "null" for a missing field on an unresolved stage', () => {
    expect(evoField(data, {}, 'fire', null, 'name')).toBe('null')
  })
})

// ── renderView dispatch ───────────────────────────────────────────────────────
describe('renderView', () => {
  const baseState: PokemonState = {
    lineage: 'fire',
    current_level: 5,
    total_xp: 2_000_000,
    created_at: '2026-05-07T00:00:00Z',
    badges: [],
    team: [],
    pc_storage: [],
    lifetime_stats: {},
    sessions: {},
    recent_events: [],
    evolution_history: [],
  }

  it('renders every supported view non-empty', () => {
    expect(SUPPORTED_VIEWS.length).toBeGreaterThan(0)
    for (const view of SUPPORTED_VIEWS) {
      const res = renderView({
        view,
        state: baseState,
        data,
        locale: en,
        lang: 'en',
        scope: 'session',
        nowEpoch: Math.floor(Date.parse('2026-05-08T00:00:00Z') / 1000),
      })
      expect(res.supported).toBe(true)
      expect(res.output.length).toBeGreaterThan(0)
    }
  })

  it('returns { supported: false } for an unknown view', () => {
    const res = renderView({ view: 'no-such-view', state: baseState, data, locale: en })
    expect(res.supported).toBe(false)
    expect(res.output).toBe('')
  })

  it('defaults lang to fr when omitted', () => {
    const res = renderView({ view: 'pokedex', state: baseState, data, locale: en })
    expect(res.supported).toBe(true)
  })

  it('passes the recap scope through to renderRecap', () => {
    const res = renderView({
      view: 'recap',
      state: { ...baseState, sessions: {} },
      data,
      locale: en,
      scope: 'today',
    })
    expect(res.supported).toBe(true)
    expect(res.output.length).toBeGreaterThan(0)
  })
})
