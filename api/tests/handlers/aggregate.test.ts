import { describe, it, expect, beforeEach } from 'vitest'
import { handleAggregate } from '../../src/handlers/aggregate'
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
        total_companions: 0,
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

describe('handleAggregate', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('returns total_players: 0 when no records', async () => {
    const res = await handleAggregate(env)
    const body = (await res.json()) as { total_players: number }
    expect(body).toEqual({ total_players: 0 })
  })

  it('sums lifetime tokens across players', async () => {
    await putStats(
      env,
      record({ anon_id: 'a1234567', stats: { lifetime: { total_tokens: 1000 } } as never }),
    )
    await putStats(
      env,
      record({ anon_id: 'b2345678', stats: { lifetime: { total_tokens: 2500 } } as never }),
    )

    const res = await handleAggregate(env)
    const body = (await res.json()) as { total_players: number; total_tokens_combined: number }
    expect(body.total_players).toBe(2)
    expect(body.total_tokens_combined).toBe(3500)
  })

  it('computes shiny_rate_observed = total_shinies / total_companions', async () => {
    await putStats(
      env,
      record({
        anon_id: 'a1234567',
        stats: { lifetime: { total_shinies: 1, total_companions: 3 } } as never,
      }),
    )
    await putStats(
      env,
      record({
        anon_id: 'b2345678',
        stats: { lifetime: { total_shinies: 0, total_companions: 1 } } as never,
      }),
    )

    const res = await handleAggregate(env)
    const body = (await res.json()) as { shiny_rate_observed: number }
    // (1 + 0) / (3 + 1) = 0.25
    expect(body.shiny_rate_observed).toBe(0.25)
  })

  it('returns shiny_rate_observed: null when no companions hatched', async () => {
    await putStats(
      env,
      record({
        anon_id: 'a1234567',
        stats: { lifetime: { total_shinies: 0, total_companions: 0 } } as never,
      }),
    )
    const res = await handleAggregate(env)
    const body = (await res.json()) as { shiny_rate_observed: number | null }
    expect(body.shiny_rate_observed).toBeNull()
  })

  it('back-compat: aggregates an OLD stored record carrying only total_compagnons', async () => {
    // Simulate a record persisted before the rename : it has the legacy key
    // and NO total_companions. The central getStats/listAllStats backfill must
    // make aggregate count it correctly.
    const legacyRecord = record({ anon_id: 'a1234567' })
    const lt = legacyRecord.stats.lifetime as Record<string, unknown>
    delete lt.total_companions
    lt.total_compagnons = 4
    lt.total_shinies = 2
    await putStats(env, legacyRecord)

    const res = await handleAggregate(env)
    const body = (await res.json()) as { shiny_rate_observed: number }
    // 2 / 4 = 0.5 — proves the legacy key flows through the read backfill.
    expect(body.shiny_rate_observed).toBe(0.5)
  })

  it('counts distinct active lineages', async () => {
    await putStats(
      env,
      record({ anon_id: 'a1234567', stats: { active: { lineage: 'fire' } } as never }),
    )
    await putStats(
      env,
      record({ anon_id: 'b2345678', stats: { active: { lineage: 'fire' } } as never }),
    )
    await putStats(
      env,
      record({ anon_id: 'c3456789', stats: { active: { lineage: 'water' } } as never }),
    )

    const res = await handleAggregate(env)
    const body = (await res.json()) as { active_lineage_distribution: Record<string, number> }
    expect(body.active_lineage_distribution).toEqual({ fire: 2, water: 1 })
  })

  it('skips null active.lineage from distribution', async () => {
    await putStats(
      env,
      record({ anon_id: 'a1234567', stats: { active: { lineage: null } } as never }),
    )
    await putStats(
      env,
      record({ anon_id: 'b2345678', stats: { active: { lineage: 'fire' } } as never }),
    )

    const res = await handleAggregate(env)
    const body = (await res.json()) as { active_lineage_distribution: Record<string, number> }
    expect(body.active_lineage_distribution).toEqual({ fire: 1 })
  })
})
