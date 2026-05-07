import { describe, it, expect, beforeEach } from 'vitest'
import { handleLeaderboard } from '../../src/handlers/leaderboard'
import { putStats } from '../../src/lib/kv'
import { MockKV, makeEnv } from '../helpers/mockKV'
import type { KVRecord } from '../../src/types'

function record(overrides: Partial<KVRecord> & { anon_id: string }): KVRecord {
  return {
    anon_id: overrides.anon_id,
    display_name: overrides.display_name ?? null,
    quote: null,
    bio: null,
    pinned_badges: [],
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
        ...(overrides.stats?.lifetime ?? {}),
      },
      active: {
        lineage: 'fire',
        current_level: 0,
        is_shiny: false,
        ...(overrides.stats?.active ?? {}),
      },
      badges: overrides.stats?.badges ?? [],
      pokedex_seen_count: overrides.stats?.pokedex_seen_count ?? 0,
    },
  }
}

describe('handleLeaderboard', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  async function call(metric = 'total_tokens', limit = 10) {
    const url = new URL(`https://test/v1/leaderboard?metric=${metric}&limit=${limit}`)
    return handleLeaderboard(url, env)
  }

  it('returns empty top when no records', async () => {
    const res = await call()
    const body = (await res.json()) as { total_players: number; top: unknown[] }
    expect(body.total_players).toBe(0)
    expect(body.top).toEqual([])
  })

  it('sorts by total_tokens descending', async () => {
    await putStats(
      env,
      record({ anon_id: 'a1234567', stats: { lifetime: { total_tokens: 100 } } as never }),
    )
    await putStats(
      env,
      record({ anon_id: 'b2345678', stats: { lifetime: { total_tokens: 500 } } as never }),
    )
    await putStats(
      env,
      record({ anon_id: 'c3456789', stats: { lifetime: { total_tokens: 300 } } as never }),
    )

    const res = await call('total_tokens')
    const body = (await res.json()) as { top: { anon_id: string; value: number }[] }
    expect(body.top.map(e => e.anon_id)).toEqual(['b2345678', 'c3456789', 'a1234567'])
    expect(body.top.map(e => e.value)).toEqual([500, 300, 100])
  })

  it('respects limit', async () => {
    for (let i = 0; i < 5; i++) {
      await putStats(
        env,
        record({
          anon_id: `id${i}0000${i}`,
          stats: { lifetime: { total_tokens: i * 100 } } as never,
        }),
      )
    }
    const res = await call('total_tokens', 3)
    const body = (await res.json()) as { top: unknown[] }
    expect(body.top).toHaveLength(3)
  })

  it('returns 400 on unknown metric', async () => {
    const res = await call('nonexistent')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; allowed: string[] }
    expect(body.error).toBe('unknown_metric')
    expect(body.allowed).toContain('total_tokens')
  })

  it('sorts by max_level when metric=max_level', async () => {
    await putStats(
      env,
      record({ anon_id: 'a1234567', stats: { lifetime: { max_level: 30 } } as never }),
    )
    await putStats(
      env,
      record({ anon_id: 'b2345678', stats: { lifetime: { max_level: 100 } } as never }),
    )
    await putStats(
      env,
      record({ anon_id: 'c3456789', stats: { lifetime: { max_level: 50 } } as never }),
    )

    const res = await call('max_level')
    const body = (await res.json()) as { top: { anon_id: string }[] }
    expect(body.top.map(e => e.anon_id)).toEqual(['b2345678', 'c3456789', 'a1234567'])
  })

  it('counts badges_count from badges array length', async () => {
    await putStats(env, record({ anon_id: 'a1234567', stats: { badges: ['hatch'] } as never }))
    await putStats(
      env,
      record({
        anon_id: 'b2345678',
        stats: { badges: ['hatch', 'first_shiny', 'champion'] } as never,
      }),
    )

    const res = await call('badges_count')
    const body = (await res.json()) as { top: { anon_id: string; value: number }[] }
    expect(body.top[0]?.anon_id).toBe('b2345678')
    expect(body.top[0]?.value).toBe(3)
  })

  it('caps limit at 100', async () => {
    const url = new URL('https://test/v1/leaderboard?metric=total_tokens&limit=999')
    const res = await handleLeaderboard(url, env)
    expect(res.status).toBe(200)
    // Empty KV → still <100 entries returned, but no crash
  })
})
