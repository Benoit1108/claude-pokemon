import { describe, it, expect, beforeEach } from 'vitest'
import {
  getStats,
  putStats,
  deleteStats,
  getCooldown,
  setCooldown,
  deleteCooldown,
  listAllStats,
} from '../../src/lib/kv'
import { MockKV, makeEnv } from '../helpers/mockKV'
import type { KVRecord } from '../../src/types'

const sampleRecord: KVRecord = {
  anon_id: 'abc12345',
  display_name: 'test',
  quote: null,
  bio: null,
  pinned_badges: [],
  origin: 'cli',
  schema_version: 1,
  client_version: '1.0.0',
  submitted_at: '2026-05-06T10:00:00Z',
  stats: {
    lifetime: {
      total_tokens: 1000,
      total_evolutions: 0,
      total_shinies: 0,
      max_level: 0,
      total_companions: 1,
      lineages_completed: [],
      games_won: 0,
      games_played: 0,
    },
    active: { lineage: 'fire', current_level: 0, is_shiny: false },
    badges: [],
    pokedex_seen_count: 0,
  },
}

describe('KV stats access', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('putStats then getStats returns the record', async () => {
    await putStats(env, sampleRecord)
    const got = await getStats(env, 'abc12345')
    expect(got).toEqual(sampleRecord)
  })

  it('getStats returns null for unknown anon_id', async () => {
    const got = await getStats(env, 'deadbeef')
    expect(got).toBeNull()
  })

  it('getStats returns null on corrupt JSON', async () => {
    await kv.put('stats:corrupt1', 'not-valid-json')
    const got = await getStats(env, 'corrupt1')
    expect(got).toBeNull()
  })

  it('deleteStats removes the record', async () => {
    await putStats(env, sampleRecord)
    expect(await getStats(env, 'abc12345')).not.toBeNull()
    await deleteStats(env, 'abc12345')
    expect(await getStats(env, 'abc12345')).toBeNull()
  })
})

describe('KV cooldown', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv()
  })

  it('getCooldown returns null when not set', async () => {
    expect(await getCooldown(env, 'abc12345')).toBeNull()
  })

  it('setCooldown then getCooldown returns timestamp', async () => {
    await setCooldown(env, 'abc12345', 86400)
    const ts = await getCooldown(env, 'abc12345')
    expect(ts).toBeTypeOf('number')
    expect(ts).toBeGreaterThan(0)
  })

  it('deleteCooldown removes the cooldown', async () => {
    await setCooldown(env, 'abc12345', 86400)
    await deleteCooldown(env, 'abc12345')
    expect(await getCooldown(env, 'abc12345')).toBeNull()
  })
})

describe('listAllStats', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('returns empty array when no records', async () => {
    expect(await listAllStats(env)).toEqual([])
  })

  it('returns only stats:* records (not cooldown:*)', async () => {
    await putStats(env, sampleRecord)
    await putStats(env, { ...sampleRecord, anon_id: 'def67890' })
    await setCooldown(env, 'abc12345', 86400)
    await setCooldown(env, 'def67890', 86400)

    const records = await listAllStats(env)
    expect(records).toHaveLength(2)
    expect(records.map(r => r.anon_id).sort()).toEqual(['abc12345', 'def67890'])
  })

  it('skips corrupt records', async () => {
    await putStats(env, sampleRecord)
    await kv.put('stats:corrupt', 'not-valid-json')
    const records = await listAllStats(env)
    expect(records).toHaveLength(1)
    expect(records[0]?.anon_id).toBe('abc12345')
  })
})
