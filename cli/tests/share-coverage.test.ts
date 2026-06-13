// Coverage-driving tests for the stats-share layer: buildSubmitPayload (pure
// whitelist projection), the local runShare subcommands (status / enable /
// disable / name) and the render helpers for the network results (forget /
// submit). The fetch itself lives in the engine; these functions are pure and
// take the result code as an argument, so no fetch mock is needed.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runShare, buildSubmitPayload, renderForget, renderSubmit } from '../src/share.js'
import type { PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8')) as Record<
  string,
  unknown
>
const baseData = JSON.parse(
  readFileSync(join(root, 'lib', 'data.default.json'), 'utf8'),
) as PokemonData
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

const NOW = '2026-06-11T12:00:00Z'

function share(args: string[], shareCfg: PokemonData['stats_share'] = {}, anonId = 'abc123') {
  const data: PokemonData = { ...baseData, stats_share: shareCfg }
  return runShare({ args, data, locale: en, anonId } as never)
}

describe('buildSubmitPayload', () => {
  it('projects the strict whitelist from data + state', () => {
    const data: PokemonData = {
      ...baseData,
      stats_share: {
        quote: 'hi',
        bio: 'about me',
        pinned_badges: ['badge-a'],
      } as PokemonData['stats_share'],
    }
    const state: PokemonState = {
      lineage: 'fire',
      current_level: 42,
      is_shiny: true,
      badges: [{ id: 'badge-a', earned_at: NOW }],
      pokedex_wild: { pikachu: { seen_at: NOW } as never, eevee: { seen_at: NOW } as never },
      lifetime_stats: {
        total_tokens: 1000,
        total_evolutions: 3,
        total_shinies: 1,
        max_level: 50,
        total_companions: 7,
        lineages_completed: ['fire'],
        games_won: 4,
        games_played: 9,
      },
    }
    const p = buildSubmitPayload(data, state, 'anon-xyz', '9.9.9', 'Red', NOW)
    expect(p.anon_id).toBe('anon-xyz')
    expect(p.display_name).toBe('Red')
    expect(p.quote).toBe('hi')
    expect(p.bio).toBe('about me')
    expect(p.pinned_badges).toEqual(['badge-a'])
    expect(p.schema_version).toBe(1)
    expect(p.client_version).toBe('9.9.9')
    expect(p.submitted_at).toBe(NOW)
    expect(p.stats.lifetime.total_companions).toBe(7)
    expect(p.stats.lifetime.games_won).toBe(4)
    expect(p.stats.active).toEqual({ lineage: 'fire', current_level: 42, is_shiny: true })
    expect(p.stats.badges).toEqual(['badge-a'])
    expect(p.stats.pokedex_seen_count).toBe(2)
    expect(p.stats.pokedex_seen_ids.sort()).toEqual(['eevee', 'pikachu'])
  })

  it('nulls empty strings and falls back to legacy total_compagnons', () => {
    const data: PokemonData = { ...baseData, stats_share: {} }
    const state: PokemonState = {
      lifetime_stats: { total_compagnons: 5 } as never,
    }
    const p = buildSubmitPayload(data, state, 'a', '1.0.0', '', NOW)
    expect(p.display_name).toBeNull()
    expect(p.quote).toBeNull()
    expect(p.bio).toBeNull()
    expect(p.pinned_badges).toEqual([])
    expect(p.stats.lifetime.total_companions).toBe(5)
    expect(p.stats.active.lineage).toBeNull()
    expect(p.stats.active.current_level).toBe(0)
    expect(p.stats.active.is_shiny).toBe(false)
  })
})

describe('runShare: status', () => {
  it('shows the disabled status by default', () => {
    const r = share(['status'], { enabled: false })!
    expect(r.changed).toBe(false)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })

  it('shows the enabled status with anon_id and pseudo', () => {
    const r = share([''], {
      enabled: true,
      anon_id: 'id42',
      display_name: 'Blue',
      endpoint: 'https://x',
    })!
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('id42')
    expect(strip(r.output)).toContain('Blue')
  })

  it('shows the enabled status without a pseudo', () => {
    const r = share(['status'], { enabled: true, anon_id: 'id42' })!
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('id42')
  })
})

describe('runShare: enable / disable', () => {
  it('shows the privacy notice without --confirm', () => {
    const r = share(['enable'], { enabled: false })!
    expect(r.changed).toBe(false)
    expect(r.data.stats_share?.enabled).not.toBe(true)
  })

  it('enables with --confirm and stores the anon_id', () => {
    const r = share(['enable', '--confirm'], { enabled: false }, 'fresh-anon')!
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.enabled).toBe(true)
    expect(r.data.stats_share?.anon_id).toBe('fresh-anon')
  })

  it('reports already enabled', () => {
    const r = share(['on'], { enabled: true, anon_id: 'have-it' })!
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('have-it')
  })

  it('disables when currently enabled', () => {
    const r = share(['disable'], { enabled: true })!
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.enabled).toBe(false)
  })

  it('reports already disabled', () => {
    const r = share(['off'], { enabled: false })!
    expect(r.changed).toBe(false)
  })
})

describe('runShare: name', () => {
  it('shows the current name when set (no arg)', () => {
    const r = share(['name'], { display_name: 'Green' })!
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('Green')
  })

  it('shows the unset placeholder when no name (no arg)', () => {
    const r = share(['pseudo'], {})!
    expect(r.changed).toBe(false)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })

  it('clears the name', () => {
    const r = share(['name', 'clear'], { display_name: 'Green' })!
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.display_name).toBeNull()
  })

  it('rejects an invalid name', () => {
    const r = share(['name', 'a'])!
    expect(r.changed).toBe(false)
  })

  it('sets a valid name', () => {
    const r = share(['name', 'Ash_Ketchum-1'])!
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.display_name).toBe('Ash_Ketchum-1')
  })
})

describe('runShare: fallthrough', () => {
  it('returns null for network/unknown subcommands', () => {
    expect(share(['submit'])).toBeNull()
    expect(share(['forget'])).toBeNull()
    expect(share(['frobnicate'])).toBeNull()
  })
})

describe('renderForget', () => {
  it('no-ops when there is no anon_id', () => {
    const r = renderForget(baseData, en, '', true)
    expect(r.changed).toBe(false)
  })

  it('clears the share config on success', () => {
    const r = renderForget(baseData, en, 'anon-1', true)
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.enabled).toBe(false)
    expect(r.data.stats_share?.anon_id).toBeNull()
    expect(strip(r.output)).toContain('anon-1')
  })

  it('reports a failed forget', () => {
    const r = renderForget(baseData, en, 'anon-1', false)
    expect(r.changed).toBe(false)
  })
})

describe('renderSubmit', () => {
  it('reports not enabled', () => {
    const r = renderSubmit({}, en, false, 200, 0, NOW)
    expect(r.changed).toBe(false)
  })

  it('records the submit timestamp on 200', () => {
    const r = renderSubmit({}, en, true, 200, 0, NOW)
    expect(r.changed).toBe(true)
    expect(r.state.last_stats_submit_at).toBe(NOW)
  })

  it('reports the cooldown on 429', () => {
    const r = renderSubmit({}, en, true, 429, 7200, NOW)
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('2')
  })

  it('reports a generic failure on other codes', () => {
    const r = renderSubmit({}, en, true, 500, 0, NOW)
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('500')
  })
})
