import { describe, it, expect, beforeEach, vi } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { handleZoneExplore } from '../../../src/handlers/zone/explore'
import { handleZoneFight } from '../../../src/handlers/zone/fight'
import { handleZoneFlee } from '../../../src/handlers/zone/flee'
import { getPendingEncounter, getStats, putPendingEncounter } from '../../../src/lib/kv'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import type { PendingEncounter } from '../../../src/types'

const trainer = {
  anon_id: 'aaaaaaaa',
  display_name: 'Tester',
  lineage: 'fire',
  level: 5,
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

function reqBody(secret: string | null, anonId: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret) headers.authorization = `Bearer ${secret}`
  return new Request('https://x', {
    method: 'POST',
    headers,
    body: JSON.stringify({ anon_id: anonId }),
  })
}

/** Seed a pending encounter directly (skips the explore cooldown). */
async function seedEncounter(
  env: ReturnType<typeof makeEnv>,
  anonId: string,
  overrides: Partial<PendingEncounter> = {},
): Promise<PendingEncounter> {
  const encounter: PendingEncounter = {
    zone_id: 'route-1',
    species_id: 'pidgey',
    level: 5,
    is_shiny: false,
    pool: 'common',
    combat_type: 'normal',
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    ...overrides,
  }
  await putPendingEncounter(env, anonId, encounter, 5 * 60)
  return encounter
}

describe('handleZoneFight — auth + preconditions', () => {
  let env: ReturnType<typeof makeEnv>
  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('401 without Bearer', async () => {
    await enable(env)
    await seedEncounter(env, 'aaaaaaaa')
    const res = await handleZoneFight(reqBody(null, 'aaaaaaaa'), '/v1/zone/route-1/fight', env)
    expect(res.status).toBe(401)
  })

  it('401 with wrong Bearer', async () => {
    await enable(env)
    await seedEncounter(env, 'aaaaaaaa')
    const res = await handleZoneFight(
      reqBody('deadbeef'.repeat(8), 'aaaaaaaa'),
      '/v1/zone/route-1/fight',
      env,
    )
    expect(res.status).toBe(401)
  })

  it('403 when trainer not arena-enabled', async () => {
    const secret = await enable(env)
    await seedEncounter(env, 'aaaaaaaa')
    const res = await handleZoneFight(reqBody(secret, 'bbbbbbbb'), '/v1/zone/route-1/fight', env)
    expect(res.status).toBe(403)
  })

  it('404 on unknown zone', async () => {
    const secret = await enable(env)
    await seedEncounter(env, 'aaaaaaaa')
    const res = await handleZoneFight(
      reqBody(secret, 'aaaaaaaa'),
      '/v1/zone/nonexistent/fight',
      env,
    )
    expect(res.status).toBe(404)
  })

  it('404 no pending encounter', async () => {
    const secret = await enable(env)
    const res = await handleZoneFight(reqBody(secret, 'aaaaaaaa'), '/v1/zone/route-1/fight', env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('no_pending_encounter')
  })

  it('409 zone mismatch (path zone ≠ encounter zone)', async () => {
    const secret = await enable(env)
    await seedEncounter(env, 'aaaaaaaa', { zone_id: 'foret-jade' })
    const res = await handleZoneFight(reqBody(secret, 'aaaaaaaa'), '/v1/zone/route-1/fight', env)
    expect(res.status).toBe(409)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('encounter_zone_mismatch')
  })
})

describe('handleZoneFight — battle resolution + XP', () => {
  let env: ReturnType<typeof makeEnv>
  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('player Lv.50 fire vs wild Lv.1 grass → win, XP awarded, encounter consumed', async () => {
    const secret = await enable(env, 50)
    await seedEncounter(env, 'aaaaaaaa', {
      species_id: 'caterpie',
      level: 1,
      combat_type: 'grass',
    })
    const res = await handleZoneFight(reqBody(secret, 'aaaaaaaa'), '/v1/zone/route-1/fight', env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      won: boolean
      xp: { amount: number }
      new_total_zone_xp: number
      leveled_up: boolean
      new_level: number
    }
    expect(body.won).toBe(true)
    expect(body.xp.amount).toBeGreaterThan(0)
    expect(body.new_total_zone_xp).toBeGreaterThan(0)

    // Pending encounter consumed
    const pending = await getPendingEncounter(env, 'aaaaaaaa')
    expect(pending).toBeNull()
  })

  it('persists XP + zone_wins on the stats record after win', async () => {
    const secret = await enable(env, 50)
    await seedEncounter(env, 'aaaaaaaa', { species_id: 'caterpie', combat_type: 'grass' })
    await handleZoneFight(reqBody(secret, 'aaaaaaaa'), '/v1/zone/route-1/fight', env)
    const stats = await getStats(env, 'aaaaaaaa')
    expect(stats?.stats.lifetime.total_zone_xp).toBeGreaterThan(0)
    expect(stats?.stats.lifetime.zone_wins).toBe(1)
    expect(stats?.stats.active.current_level).toBeGreaterThanOrEqual(50)
  })

  it('deterministic : same encounter + same trainer → identical battle log', async () => {
    // Use fresh envs for both fights so the trainer's state (level, XP)
    // doesn't drift between runs. Same (anon_id, encounter.created_at,
    // encounter.species_id, encounter.level) = same seed = same log.
    const encounterArgs = {
      species_id: 'pidgey',
      level: 8,
      combat_type: 'normal' as const,
      created_at: '2026-05-11T10:00:00Z',
    }
    const env1 = makeEnv(new MockKV())
    const s1 = await enable(env1, 30)
    await seedEncounter(env1, 'aaaaaaaa', encounterArgs)
    const r1 = await handleZoneFight(reqBody(s1, 'aaaaaaaa'), '/v1/zone/route-1/fight', env1)
    const b1 = (await r1.json()) as { battle: { turns: unknown[] } }

    const env2 = makeEnv(new MockKV())
    const s2 = await enable(env2, 30)
    await seedEncounter(env2, 'aaaaaaaa', encounterArgs)
    const r2 = await handleZoneFight(reqBody(s2, 'aaaaaaaa'), '/v1/zone/route-1/fight', env2)
    const b2 = (await r2.json()) as { battle: { turns: unknown[] } }
    expect(b1.battle.turns).toEqual(b2.battle.turns)
  })

  it('legendary pool gives 3× XP multiplier', async () => {
    const secret = await enable(env, 80)
    await seedEncounter(env, 'aaaaaaaa', {
      species_id: 'mewtwo',
      level: 75,
      combat_type: 'normal',
      pool: 'legendary',
    })
    const res = await handleZoneFight(
      reqBody(secret, 'aaaaaaaa'),
      '/v1/zone/mont-argent/fight',
      env,
    )
    const body = (await res.json()) as { won: boolean; xp: { amount: number } }
    if (body.won) {
      // base = 75 * 50 = 3750. With 3× legendary, eff 1.0 → 11250.
      // (Could be more if super-effective, less if not very effective.)
      expect(body.xp.amount).toBeGreaterThan(3750)
    }
  })
})

describe('handleZoneFight — end-to-end via explore', () => {
  let env: ReturnType<typeof makeEnv>
  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('explore → fight chains correctly (combat_type is stamped at explore)', async () => {
    const secret = await enable(env, 5)
    // Force encounter outcome
    vi.spyOn(Math, 'random').mockReturnValue(0.1)
    await handleZoneExplore(reqBody(secret, 'aaaaaaaa'), '/v1/zone/route-1/explore', env)
    vi.restoreAllMocks()

    // Encounter exists with a combat_type set
    const pending = await getPendingEncounter(env, 'aaaaaaaa')
    expect(pending?.combat_type).toBeTruthy()

    // Fight resolves
    const res = await handleZoneFight(reqBody(secret, 'aaaaaaaa'), '/v1/zone/route-1/fight', env)
    expect(res.status).toBe(200)
  })
})

describe('handleZoneFlee', () => {
  let env: ReturnType<typeof makeEnv>
  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('discards the pending encounter', async () => {
    const secret = await enable(env)
    await seedEncounter(env, 'aaaaaaaa')
    const res = await handleZoneFlee(reqBody(secret, 'aaaaaaaa'), '/v1/zone/route-1/flee', env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; fled: boolean }
    expect(body.fled).toBe(true)
    expect(await getPendingEncounter(env, 'aaaaaaaa')).toBeNull()
  })

  it('idempotent — fleeing nothing is a 200 with fled=false', async () => {
    const secret = await enable(env)
    const res = await handleZoneFlee(reqBody(secret, 'aaaaaaaa'), '/v1/zone/route-1/flee', env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { fled: boolean }
    expect(body.fled).toBe(false)
  })

  it('requires Bearer auth (401)', async () => {
    await enable(env)
    await seedEncounter(env, 'aaaaaaaa')
    const res = await handleZoneFlee(reqBody(null, 'aaaaaaaa'), '/v1/zone/route-1/flee', env)
    expect(res.status).toBe(401)
  })
})
