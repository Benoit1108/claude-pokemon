import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { handleZoneExplore } from '../../../src/handlers/zone/explore'
import { handleZoneList } from '../../../src/handlers/zone/list'
import { handleZoneDetail } from '../../../src/handlers/zone/detail'
import { getPendingEncounter, getStats, getZoneCooldown, putStats } from '../../../src/lib/kv'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import type { KVRecord } from '../../../src/types'

const trainer = {
  anon_id: 'aaaaaaaa',
  display_name: 'Tester',
  lineage: 'fire',
  level: 5, // valid for Route 1 (Lv.1-10)
  is_shiny: false,
}

async function enable(env: ReturnType<typeof makeEnv>, level = 5): Promise<string> {
  const res = await handleArenaEnable(
    new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...trainer, level }),
    }),
    env,
  )
  return ((await res.json()) as { arena_secret: string }).arena_secret
}

function exploreReq(secret: string | null, anonId: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret) headers.authorization = `Bearer ${secret}`
  return new Request('https://x', {
    method: 'POST',
    headers,
    body: JSON.stringify({ anon_id: anonId }),
  })
}

describe('handleZoneList (GET /v1/zones)', () => {
  it('returns the 8 catalogued zones', async () => {
    const env = makeEnv(new MockKV())
    const res = await handleZoneList(env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      zones: { id: string; level_min: number; level_max: number; wild_pool_size: number }[]
    }
    expect(body.zones.length).toBe(8)
    expect(body.zones[0]?.id).toBe('route-1')
    expect(body.zones[0]?.level_min).toBe(1)
    expect(body.zones[0]?.level_max).toBe(10)
    expect(body.zones[0]?.wild_pool_size).toBeGreaterThan(0)
  })
})

describe('handleZoneDetail (GET /v1/zones/<id>)', () => {
  it('returns the zone with its full species lists', async () => {
    const env = makeEnv(new MockKV())
    const res = await handleZoneDetail('/v1/zones/route-1', env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { id: string; wild_pool: string[] }
    expect(body.id).toBe('route-1')
    expect(body.wild_pool).toContain('pidgey')
  })

  it('404 on unknown zone', async () => {
    const env = makeEnv(new MockKV())
    const res = await handleZoneDetail('/v1/zones/nonexistent', env)
    expect(res.status).toBe(404)
  })

  it('400 on malformed path', async () => {
    const env = makeEnv(new MockKV())
    const res = await handleZoneDetail('/v1/zones/BAD-PATH!', env)
    expect(res.status).toBe(400)
  })
})

describe('handleZoneExplore — auth + bracket', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('rejects without Bearer (401)', async () => {
    await enable(env)
    const res = await handleZoneExplore(
      exploreReq(null, 'aaaaaaaa'),
      '/v1/zone/route-1/explore',
      env,
    )
    expect(res.status).toBe(401)
  })

  it('rejects with wrong Bearer (401)', async () => {
    await enable(env)
    const res = await handleZoneExplore(
      exploreReq('deadbeef'.repeat(8), 'aaaaaaaa'),
      '/v1/zone/route-1/explore',
      env,
    )
    expect(res.status).toBe(401)
  })

  it('returns 403 when the trainer is not arena-enabled', async () => {
    const secret = await enable(env)
    const res = await handleZoneExplore(
      exploreReq(secret, 'bbbbbbbb'), // different anon_id
      '/v1/zone/route-1/explore',
      env,
    )
    expect(res.status).toBe(403)
  })

  it('returns 404 on unknown zone', async () => {
    const secret = await enable(env)
    const res = await handleZoneExplore(
      exploreReq(secret, 'aaaaaaaa'),
      '/v1/zone/nonexistent/explore',
      env,
    )
    expect(res.status).toBe(404)
  })

  it('locks out a trainer below zone.level_min - 10', async () => {
    const secret = await enable(env, 1)
    const res = await handleZoneExplore(
      exploreReq(secret, 'aaaaaaaa'),
      '/v1/zone/mont-argent/explore', // Lv.71-100, lockout below 61
      env,
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('zone_locked')
  })

  it('accepts a trainer within the bracket', async () => {
    const secret = await enable(env, 5)
    const res = await handleZoneExplore(
      exploreReq(secret, 'aaaaaaaa'),
      '/v1/zone/route-1/explore',
      env,
    )
    expect(res.status).toBe(200)
  })
})

describe('handleZoneExplore — cooldown', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('429 when exploring within 20s of last explore', async () => {
    const secret = await enable(env)
    await handleZoneExplore(exploreReq(secret, 'aaaaaaaa'), '/v1/zone/route-1/explore', env)
    const second = await handleZoneExplore(
      exploreReq(secret, 'aaaaaaaa'),
      '/v1/zone/route-1/explore',
      env,
    )
    expect(second.status).toBe(429)
    const body = (await second.json()) as { error: string; cooldown_remaining_s: number }
    expect(body.error).toBe('rate_limited')
    expect(body.cooldown_remaining_s).toBeGreaterThan(0)
  })

  it('cooldown is per-zone — exploring a different zone works', async () => {
    const secret = await enable(env, 5)
    await handleZoneExplore(exploreReq(secret, 'aaaaaaaa'), '/v1/zone/route-1/explore', env)
    // foret-jade requires Lv.11+ ; need a higher-level trainer for this test.
    // Re-enable with a level that passes both brackets.
    const env2 = makeEnv(new MockKV())
    const secret2 = await enable(env2, 12)
    await handleZoneExplore(exploreReq(secret2, 'aaaaaaaa'), '/v1/zone/route-1/explore', env2)
    const onForet = await handleZoneExplore(
      exploreReq(secret2, 'aaaaaaaa'),
      '/v1/zone/foret-jade/explore',
      env2,
    )
    expect(onForet.status).toBe(200)
  })

  it('sets the cooldown timestamp on success', async () => {
    const secret = await enable(env)
    await handleZoneExplore(exploreReq(secret, 'aaaaaaaa'), '/v1/zone/route-1/explore', env)
    const cd = await getZoneCooldown(env, 'aaaaaaaa', 'route-1')
    expect(cd).toBeGreaterThan(0)
  })
})

describe('handleZoneExplore — encounter mechanics', () => {
  let env: ReturnType<typeof makeEnv>
  let randomSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })
  afterEach(() => {
    randomSpy?.mockRestore()
  })

  it('rolls an encounter when Math.random < 0.7', async () => {
    const secret = await enable(env)
    // Force the outcome to encounter (roll = 0.1) and common species (0.5).
    // First two calls are the outer roll then the species pool roll, plus
    // pickFrom and level/shiny. We just need the first roll < 0.7.
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1)

    const res = await handleZoneExplore(
      exploreReq(secret, 'aaaaaaaa'),
      '/v1/zone/route-1/explore',
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      kind: string
      encounter: { zone_id: string; species_id: string; level: number; is_shiny: boolean }
    }
    expect(body.kind).toBe('encounter')
    expect(body.encounter.zone_id).toBe('route-1')
    expect(body.encounter.level).toBeGreaterThanOrEqual(1)
    expect(body.encounter.level).toBeLessThanOrEqual(10)
    expect(typeof body.encounter.species_id).toBe('string')

    // PendingEncounter persisted
    const pending = await getPendingEncounter(env, 'aaaaaaaa')
    expect(pending).not.toBeNull()
    expect(pending?.species_id).toBe(body.encounter.species_id)
  })

  it('rolls an item between 0.7 and 0.95', async () => {
    const secret = await enable(env)
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.8)

    const res = await handleZoneExplore(
      exploreReq(secret, 'aaaaaaaa'),
      '/v1/zone/route-1/explore',
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { kind: string; item: { kind: string; emoji: string } }
    expect(body.kind).toBe('item')
    expect(body.item.kind).toBeTruthy()
  })

  it('returns nothing when roll >= 0.95', async () => {
    const secret = await enable(env)
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.97)

    const res = await handleZoneExplore(
      exploreReq(secret, 'aaaaaaaa'),
      '/v1/zone/route-1/explore',
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { kind: string }
    expect(body.kind).toBe('nothing')
  })

  it('encounter updates pokedex_seen_ids on the trainer record', async () => {
    const secret = await enable(env)
    // Seed an existing stats record so the explore handler can mutate it.
    const seedRecord: KVRecord = {
      anon_id: 'aaaaaaaa',
      display_name: 'Tester',
      quote: null,
      bio: null,
      pinned_badges: [],
      origin: 'web',
      schema_version: 1,
      client_version: 'test',
      submitted_at: '2026-05-11T10:00:00Z',
      stats: {
        lifetime: {
          total_tokens: 0,
          total_evolutions: 0,
          total_shinies: 0,
          max_level: 5,
          total_companions: 1,
          lineages_completed: [],
          games_won: 0,
          games_played: 0,
        },
        active: { lineage: 'fire', current_level: 5, is_shiny: false },
        badges: [],
        pokedex_seen_count: 0,
        pokedex_seen_ids: [],
      },
    }
    await putStats(env, seedRecord)
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.1)

    await handleZoneExplore(exploreReq(secret, 'aaaaaaaa'), '/v1/zone/route-1/explore', env)
    const updated = await getStats(env, 'aaaaaaaa')
    expect(updated?.stats.pokedex_seen_ids?.length).toBeGreaterThan(0)
    expect(updated?.stats.pokedex_seen_count).toBeGreaterThan(0)
  })
})
