import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaEnable } from '../../src/handlers/arena/enable'
import { handleTrainer } from '../../src/handlers/trainer'
import { handleTrainerProfilePatch } from '../../src/handlers/trainer-profile'
import { putStats } from '../../src/lib/kv'
import { MockKV, makeEnv } from '../helpers/mockKV'
import type { KVRecord } from '../../src/types'

const trainer = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 25,
  is_shiny: false,
}

async function enable(env: ReturnType<typeof makeEnv>): Promise<string> {
  const res = await handleArenaEnable(
    new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trainer),
    }),
    env,
  )
  return ((await res.json()) as { arena_secret: string }).arena_secret
}

function patchReq(secret: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret) headers.authorization = `Bearer ${secret}`
  return new Request('https://x', {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

describe('handleTrainerProfilePatch', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('updates display_name + quote + bio (bootstrap path, no prior submit)', async () => {
    const secret = await enable(env)
    const res = await handleTrainerProfilePatch(
      patchReq(secret, {
        display_name: 'Ketchum',
        quote: "I'm gonna be the very best",
        bio: 'Trainer from Pallet Town.\nCollected the Boulder Badge.',
      }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      trainer: { display_name: string; quote: string; bio: string }
    }
    expect(body.trainer.display_name).toBe('Ketchum')
    expect(body.trainer.quote).toBe("I'm gonna be the very best")
    expect(body.trainer.bio).toContain('Pallet Town')

    // Verify GET picks up the change
    const get = await handleTrainer('/v1/trainer/aaaaaaaa', env)
    const gotten = (await get.json()) as { display_name: string; quote: string }
    expect(gotten.display_name).toBe('Ketchum')
    expect(gotten.quote).toBe("I'm gonna be the very best")
  })

  it('rejects without Bearer (401)', async () => {
    await enable(env)
    const res = await handleTrainerProfilePatch(
      patchReq(null, { display_name: 'Ketchum' }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    expect(res.status).toBe(401)
  })

  it('rejects with wrong Bearer (401)', async () => {
    await enable(env)
    const res = await handleTrainerProfilePatch(
      patchReq('deadbeef'.repeat(8), { display_name: 'Ketchum' }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    expect(res.status).toBe(401)
  })

  it('returns 403 when the trainer is not arena-enabled', async () => {
    const secret = await enable(env)
    const res = await handleTrainerProfilePatch(
      patchReq(secret, { display_name: 'X' }),
      '/v1/trainer/bbbbbbbb/profile',
      env,
    )
    expect(res.status).toBe(403)
  })

  it('rejects oversized bio (400)', async () => {
    const secret = await enable(env)
    const res = await handleTrainerProfilePatch(
      patchReq(secret, { bio: 'a'.repeat(200) }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects unknown pinned badge (400)', async () => {
    const secret = await enable(env)
    const res = await handleTrainerProfilePatch(
      patchReq(secret, { pinned_badges: ['mystery_badge'] }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    expect(res.status).toBe(400)
  })

  it('intersects pinned_badges with owned badges (defense in depth)', async () => {
    const secret = await enable(env)
    // Seed an existing record with only 'hatch' owned.
    const record: KVRecord = {
      anon_id: 'aaaaaaaa',
      display_name: 'Ash',
      quote: null,
      bio: null,
      pinned_badges: [],
      origin: 'cli',
      schema_version: 1,
      client_version: 'test',
      submitted_at: '2026-05-11T10:00:00Z',
      stats: {
        lifetime: {
          total_tokens: 0,
          total_evolutions: 0,
          total_shinies: 0,
          max_level: 25,
          total_compagnons: 1,
          lineages_completed: [],
          games_won: 0,
          games_played: 0,
        },
        active: { lineage: 'fire', current_level: 25, is_shiny: false },
        badges: ['hatch'],
        pokedex_seen_count: 0,
        pokedex_seen_ids: [],
      },
    }
    await putStats(env, record)

    const res = await handleTrainerProfilePatch(
      patchReq(secret, { pinned_badges: ['hatch', 'champion'] }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { trainer: { pinned_badges: string[] } }
    // 'champion' filtered out — not owned.
    expect(body.trainer.pinned_badges).toEqual(['hatch'])
  })

  it('clears fields when passed null', async () => {
    const secret = await enable(env)
    // First set values
    await handleTrainerProfilePatch(
      patchReq(secret, { quote: 'hello' }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    // Then clear
    const res = await handleTrainerProfilePatch(
      patchReq(secret, { quote: null }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { trainer: { quote: string | null } }
    expect(body.trainer.quote).toBeNull()
  })

  it('leaves untouched fields alone (partial update)', async () => {
    const secret = await enable(env)
    await handleTrainerProfilePatch(
      patchReq(secret, { quote: 'first quote', bio: 'first bio' }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    // Update ONLY bio
    await handleTrainerProfilePatch(
      patchReq(secret, { bio: 'updated bio' }),
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    const get = await handleTrainer('/v1/trainer/aaaaaaaa', env)
    const body = (await get.json()) as { quote: string; bio: string }
    expect(body.quote).toBe('first quote') // untouched
    expect(body.bio).toBe('updated bio')
  })

  it('rejects invalid display_name (400)', async () => {
    const secret = await enable(env)
    const res = await handleTrainerProfilePatch(
      patchReq(secret, { display_name: 'a' }), // too short
      '/v1/trainer/aaaaaaaa/profile',
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects bad path (400)', async () => {
    const secret = await enable(env)
    const res = await handleTrainerProfilePatch(
      patchReq(secret, { quote: 'x' }),
      '/v1/trainer/BAD-ID/profile',
      env,
    )
    expect(res.status).toBe(400)
  })
})
