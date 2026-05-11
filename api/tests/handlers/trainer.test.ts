import { describe, it, expect, beforeEach } from 'vitest'
import { handleTrainer } from '../../src/handlers/trainer'
import { putStats } from '../../src/lib/kv'
import { MockKV, makeEnv } from '../helpers/mockKV'
import type { KVRecord } from '../../src/types'

const sampleRecord: KVRecord = {
  anon_id: 'c5bbdea6',
  display_name: 'benoit1108',
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

describe('handleTrainer', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('returns 200 with full record for known anon_id', async () => {
    await putStats(env, sampleRecord)
    const res = await handleTrainer('/v1/trainer/c5bbdea6', env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { anon_id: string; display_name: string; stats: object }
    expect(body.anon_id).toBe('c5bbdea6')
    expect(body.display_name).toBe('benoit1108')
    expect(body.stats).toBeDefined()
  })

  it('returns the quote when set', async () => {
    await putStats(env, { ...sampleRecord, quote: "Catch 'em all!" })
    const res = await handleTrainer('/v1/trainer/c5bbdea6', env)
    const body = (await res.json()) as { quote: string | null }
    expect(body.quote).toBe("Catch 'em all!")
  })

  it('returns null quote when not set', async () => {
    await putStats(env, { ...sampleRecord, quote: null })
    const res = await handleTrainer('/v1/trainer/c5bbdea6', env)
    const body = (await res.json()) as { quote: string | null }
    expect(body.quote).toBeNull()
  })

  it('returns bio + pinned_badges (Sprint 2.9)', async () => {
    await putStats(env, {
      ...sampleRecord,
      bio: 'Caught all my Eevees in Goldenrod City.',
      pinned_badges: ['hatch', 'first_shiny'],
    })
    const res = await handleTrainer('/v1/trainer/c5bbdea6', env)
    const body = (await res.json()) as { bio: string | null; pinned_badges: string[] }
    expect(body.bio).toBe('Caught all my Eevees in Goldenrod City.')
    expect(body.pinned_badges).toEqual(['hatch', 'first_shiny'])
  })

  it('falls back to null bio + [] pinned_badges on legacy records', async () => {
    // Simulate a pre-2.9 KV record by stripping the new fields. The handler
    // must still respond with safe defaults rather than crashing.
    const legacy = { ...sampleRecord } as Partial<KVRecord> & { anon_id: string }
    delete (legacy as { bio?: unknown }).bio
    delete (legacy as { pinned_badges?: unknown }).pinned_badges
    await putStats(env, legacy as KVRecord)
    const res = await handleTrainer('/v1/trainer/c5bbdea6', env)
    const body = (await res.json()) as { bio: string | null; pinned_badges: string[] }
    expect(body.bio).toBeNull()
    expect(body.pinned_badges).toEqual([])
  })

  it('returns 404 for unknown anon_id', async () => {
    const res = await handleTrainer('/v1/trainer/deadbeef', env)
    expect(res.status).toBe(404)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('trainer_not_found')
  })

  it('returns 400 on malformed path', async () => {
    const res = await handleTrainer('/v1/trainer/BAD-ID!', env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid_path')
  })

  it('returns 400 on too-short anon_id', async () => {
    const res = await handleTrainer('/v1/trainer/abc', env)
    expect(res.status).toBe(400)
  })

  it('does not leak internal fields (cooldown info)', async () => {
    await putStats(env, sampleRecord)
    const res = await handleTrainer('/v1/trainer/c5bbdea6', env)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).not.toHaveProperty('cooldown')
    expect(body).not.toHaveProperty('ip')
  })
})
