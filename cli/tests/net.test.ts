// Network-view renderers (Phase R3d-4). Pure render of a fetched response (or
// an error marker). The HTTP fetch itself (cli.ts `net`) is a thin wrapper not
// covered here. Asserts on EN locale text (tests/setup default).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderLeaderboard, renderAggregate } from '../src/render/net.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8'))
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

const data = { stats_share: { anon_id: 'abcd1234', endpoint: 'https://x' } }

describe('renderLeaderboard', () => {
  it('renders rows, marks self, eggs, and shiny', () => {
    const resp = {
      total_players: 3,
      top: [
        {
          anon_id: 'abcd1234',
          display_name: 'Me',
          value: 1234567,
          lineage: 'fire',
          level: 40,
          is_shiny: true,
        },
        {
          anon_id: 'zzzz9999',
          display_name: '',
          value: 500,
          lineage: 'water',
          level: 0,
          is_shiny: false,
        },
      ],
    }
    const out = strip(renderLeaderboard(data, en, 'total_tokens', { resp }))
    expect(out).toContain('Me#abcd') // pseudo#shortid
    expect(out).toContain('zzzz9999') // no pseudo → full id
    expect(out).toContain('1 234 567') // fmtInt
    expect(out).toContain('🥚') // level 0 → egg
    expect(out).toContain('🥇') // rank 1 prefix
    expect(out).toContain('✦') // shiny mark
  })

  it('no endpoint → the no_endpoint message', () => {
    const out = strip(renderLeaderboard(data, en, 'total_tokens', { endpoint: false }))
    expect(out).toContain(en.leaderboard.no_endpoint)
  })

  it('fetch failed → the fetch_failed message', () => {
    const out = strip(renderLeaderboard(data, en, 'total_tokens', { fetchFailed: true }))
    expect(out).toContain(en.leaderboard.fetch_failed)
  })
})

describe('renderAggregate', () => {
  it('renders totals + lineage distribution (sorted desc)', () => {
    const resp = {
      total_players: 42,
      total_tokens_combined: 9000000,
      total_shinies_observed: 7,
      shiny_rate_observed: 0.012,
      active_lineage_distribution: { fire: 5, water: 20, grass: 3 },
    }
    const out = strip(renderAggregate(data, en, { resp }))
    expect(out).toContain('9 000 000')
    expect(out).toContain('42')
    // distribution sorted desc → water(20) before fire(5) before grass(3)
    const iWater = out.indexOf('water')
    const iFire = out.indexOf('fire')
    const iGrass = out.indexOf('grass')
    expect(iWater).toBeLessThan(iFire)
    expect(iFire).toBeLessThan(iGrass)
  })

  it('zero players → the empty message', () => {
    const out = strip(renderAggregate(data, en, { resp: { total_players: 0 } }))
    expect(out).toContain(en.aggregate.empty)
  })
})
