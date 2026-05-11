import { describe, it, expect, beforeEach } from 'vitest'
import { handleForget } from '../../src/handlers/forget'
import { putStats, setCooldown, getStats, getCooldown } from '../../src/lib/kv'
import { MockKV, makeEnv } from '../helpers/mockKV'
import type { KVRecord } from '../../src/types'

const sampleRecord: KVRecord = {
  anon_id: 'abc12345',
  display_name: null,
  quote: null,
  bio: null,
  pinned_badges: [],
  origin: 'cli',
  schema_version: 1,
  client_version: '1.0.0',
  submitted_at: '2026-05-06T10:00:00Z',
  stats: {
    lifetime: {
      total_tokens: 0,
      total_evolutions: 0,
      total_shinies: 0,
      max_level: 0,
      total_compagnons: 0,
      lineages_completed: [],
      games_won: 0,
      games_played: 0,
    },
    active: { lineage: null, current_level: 0, is_shiny: false },
    badges: [],
    pokedex_seen_count: 0,
  },
}

describe('handleForget', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('purges record + cooldown for valid anon_id', async () => {
    await putStats(env, sampleRecord)
    await setCooldown(env, 'abc12345', 86400)

    const url = new URL('https://test/v1/forget?anon_id=abc12345')
    const res = await handleForget(url, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; forgotten: string }
    expect(body.ok).toBe(true)
    expect(body.forgotten).toBe('abc12345')

    expect(await getStats(env, 'abc12345')).toBeNull()
    expect(await getCooldown(env, 'abc12345')).toBeNull()
  })

  it('returns 400 on missing anon_id query param', async () => {
    const url = new URL('https://test/v1/forget')
    const res = await handleForget(url, env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid_anon_id')
  })

  it('returns 400 on malformed anon_id', async () => {
    const url = new URL('https://test/v1/forget?anon_id=BAD-ID!')
    const res = await handleForget(url, env)
    expect(res.status).toBe(400)
  })

  it('returns 200 even when anon_id has no record (idempotent)', async () => {
    const url = new URL('https://test/v1/forget?anon_id=deadbeef')
    const res = await handleForget(url, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { forgotten: string }
    expect(body.forgotten).toBe('deadbeef')
  })
})
