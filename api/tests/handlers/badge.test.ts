import { describe, it, expect, beforeEach } from 'vitest'
import { handleBadge } from '../../src/handlers/badge'
import { putStats } from '../../src/lib/kv'
import { MockKV, makeEnv } from '../helpers/mockKV'
import type { KVRecord } from '../../src/types'

const sampleRecord: KVRecord = {
  anon_id: 'c5bbdea6',
  display_name: 'benoit1108',
  schema_version: 1,
  client_version: '1.0.0',
  submitted_at: '2026-05-06T10:00:00Z',
  stats: {
    lifetime: {
      total_tokens: 2_638_000,
      total_evolutions: 0,
      total_shinies: 1,
      max_level: 0,
      total_compagnons: 1,
      lineages_completed: [],
      games_won: 0,
      games_played: 0,
    },
    active: { lineage: 'fire', current_level: 0, is_shiny: false },
    badges: ['hatch'],
    pokedex_seen_count: 5,
  },
}

describe('handleBadge', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('returns 200 SVG with stats for known anon_id', async () => {
    await putStats(env, sampleRecord)
    const res = await handleBadge('/v1/badge/c5bbdea6.svg', env)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    expect(res.headers.get('cache-control')).toContain('max-age=300')
    const text = await res.text()
    expect(text).toContain('<svg')
    expect(text).toContain('benoit1108')
    expect(text).toContain('2.6M')
  })

  it('returns 404 placeholder SVG when trainer not found', async () => {
    const res = await handleBadge('/v1/badge/deadbeef.svg', env)
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    const text = await res.text()
    expect(text).toContain('<svg')
    expect(text).toContain('trainer not found')
  })

  it('returns 400 placeholder SVG on malformed URL', async () => {
    const res = await handleBadge('/v1/badge/BAD-ID.svg', env)
    expect(res.status).toBe(400)
    expect(res.headers.get('content-type')).toBe('image/svg+xml')
    const text = await res.text()
    expect(text).toContain('invalid badge URL')
  })

  it('returns 400 on non-svg extension', async () => {
    const res = await handleBadge('/v1/badge/c5bbdea6.png', env)
    expect(res.status).toBe(400)
  })
})
