import { describe, it, expect, vi } from 'vitest'
import { ApiClient } from '~/services/api'
import type { AggregateResponse, LeaderboardResponse, TrainerResponse } from '~/types/api'

describe('ApiClient', () => {
  function makeClient(mockResponse: unknown) {
    const fetchMock = vi.fn().mockResolvedValue(mockResponse)
    const client = new ApiClient({
      baseUrl: 'https://example.test',
      fetchImpl: fetchMock as never,
    })
    return { client, fetchMock }
  }

  it('aggregate() calls /v1/aggregate with the configured baseURL', async () => {
    const expected: AggregateResponse = { total_players: 42 }
    const { client, fetchMock } = makeClient(expected)

    const result = await client.aggregate()

    expect(result).toEqual(expected)
    expect(fetchMock).toHaveBeenCalledWith('/v1/aggregate', { baseURL: 'https://example.test' })
  })

  it('leaderboard() passes default metric and limit', async () => {
    const expected: LeaderboardResponse = { metric: 'total_tokens', total_players: 0, top: [] }
    const { client, fetchMock } = makeClient(expected)

    await client.leaderboard()

    expect(fetchMock).toHaveBeenCalledWith('/v1/leaderboard', {
      baseURL: 'https://example.test',
      query: { metric: 'total_tokens', limit: 10 },
    })
  })

  it('leaderboard() respects custom metric and limit', async () => {
    const { client, fetchMock } = makeClient({ metric: 'max_level', total_players: 5, top: [] })

    await client.leaderboard('max_level', 3)

    expect(fetchMock).toHaveBeenCalledWith('/v1/leaderboard', {
      baseURL: 'https://example.test',
      query: { metric: 'max_level', limit: 3 },
    })
  })

  it('trainer() builds the path with the given anon_id', async () => {
    const expected: TrainerResponse = {
      anon_id: 'c5bbdea6',
      display_name: 'benoit1108',
      quote: null,
      submitted_at: '2026-05-06T10:00:00Z',
      client_version: '1.0.0',
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
    const { client, fetchMock } = makeClient(expected)

    const result = await client.trainer('c5bbdea6')

    expect(result.anon_id).toBe('c5bbdea6')
    expect(fetchMock).toHaveBeenCalledWith('/v1/trainer/c5bbdea6', {
      baseURL: 'https://example.test',
    })
  })

  it('propagates errors from the fetcher', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    const client = new ApiClient({ baseUrl: 'https://x', fetchImpl: fetchMock as never })

    await expect(client.aggregate()).rejects.toThrow('network down')
  })

  it('arenaOpponents() defaults limit to 50', async () => {
    const { client, fetchMock } = makeClient({ opponents: [], total: 0 })
    await client.arenaOpponents()
    expect(fetchMock).toHaveBeenCalledWith('/v1/arena/opponents', {
      baseURL: 'https://example.test',
      query: { limit: 50 },
    })
  })

  it('arenaOpponents() respects custom limit', async () => {
    const { client, fetchMock } = makeClient({ opponents: [], total: 0 })
    await client.arenaOpponents(10)
    expect(fetchMock).toHaveBeenCalledWith('/v1/arena/opponents', {
      baseURL: 'https://example.test',
      query: { limit: 10 },
    })
  })

  it('arenaBattle() builds the path with the given battle id', async () => {
    const battleId = 'a'.repeat(32)
    const { client, fetchMock } = makeClient({ battle: { battle_id: battleId } })
    await client.arenaBattle(battleId)
    expect(fetchMock).toHaveBeenCalledWith(`/v1/arena/battle/${battleId}`, {
      baseURL: 'https://example.test',
    })
  })

  it('arenaPairRedeem() POSTs the code in body', async () => {
    const { client, fetchMock } = makeClient({
      ok: true,
      anon_id: 'a'.repeat(8),
      arena_secret: 'a'.repeat(32),
    })
    await client.arenaPairRedeem('ABCDEF')
    expect(fetchMock).toHaveBeenCalledWith('/v1/arena/pair/redeem', {
      method: 'POST',
      baseURL: 'https://example.test',
      body: { code: 'ABCDEF' },
    })
  })

  it('arenaLive() builds the path with the given battle id', async () => {
    const battleId = 'b'.repeat(32)
    const { client, fetchMock } = makeClient({ battle_id: battleId, state: 'pending' })
    await client.arenaLive(battleId)
    expect(fetchMock).toHaveBeenCalledWith(`/v1/arena/live/${battleId}`, {
      baseURL: 'https://example.test',
    })
  })

  it('arenaLiveCommit() includes Bearer auth header', async () => {
    const { client, fetchMock } = makeClient({ ok: true })
    await client.arenaLiveCommit({
      battleId: 'c'.repeat(32),
      anonId: 'd'.repeat(8),
      moveId: 'flamethrower',
      arenaSecret: 'e'.repeat(32),
    })
    expect(fetchMock).toHaveBeenCalledWith(`/v1/arena/live/${'c'.repeat(32)}/commit`, {
      method: 'POST',
      baseURL: 'https://example.test',
      body: { anon_id: 'd'.repeat(8), move_id: 'flamethrower' },
      headers: { authorization: `Bearer ${'e'.repeat(32)}` },
    })
  })

  it('trainerProfilePatch() sends PATCH with Bearer auth and patch body', async () => {
    const { client, fetchMock } = makeClient({ ok: true, trainer: {} })
    await client.trainerProfilePatch({
      anonId: 'f'.repeat(8),
      arenaSecret: '1'.repeat(32),
      patch: {
        display_name: 'Ash',
        quote: 'Catch em all',
        bio: null,
        pinned_badges: ['fire-master'],
      },
    })
    expect(fetchMock).toHaveBeenCalledWith(`/v1/trainer/${'f'.repeat(8)}/profile`, {
      method: 'PATCH',
      baseURL: 'https://example.test',
      body: {
        display_name: 'Ash',
        quote: 'Catch em all',
        bio: null,
        pinned_badges: ['fire-master'],
      },
      headers: { authorization: `Bearer ${'1'.repeat(32)}` },
    })
  })

  it('arenaEnable() declares origin and sends the full team snapshot', async () => {
    const { client, fetchMock } = makeClient({
      ok: true,
      arena_secret: '2'.repeat(32),
      enabled_at: '2026-05-12T10:00:00Z',
      origin: 'web',
      team_snapshot: {
        anon_id: '3'.repeat(8),
        display_name: 'Ash',
        lineage: 'fire',
        level: 1,
        is_shiny: false,
      },
    })
    await client.arenaEnable({
      anon_id: '3'.repeat(8),
      display_name: 'Ash',
      lineage: 'fire',
      level: 1,
      is_shiny: false,
      origin: 'web',
    })
    expect(fetchMock).toHaveBeenCalledWith('/v1/arena/enable', {
      method: 'POST',
      baseURL: 'https://example.test',
      body: {
        anon_id: '3'.repeat(8),
        display_name: 'Ash',
        lineage: 'fire',
        level: 1,
        is_shiny: false,
        origin: 'web',
      },
    })
  })

  it('arenaWhoami() builds a GET with anon_id query + Bearer auth', async () => {
    const { client, fetchMock } = makeClient({
      ok: true,
      anon_id: '4'.repeat(8),
      enabled_at: '2026-05-12T10:00:00Z',
      updated_at: '2026-05-12T10:00:00Z',
      origin: 'web',
      team_snapshot: {
        anon_id: '4'.repeat(8),
        display_name: 'Ash',
        lineage: 'fire',
        level: 1,
        is_shiny: false,
      },
    })
    await client.arenaWhoami({ anonId: '4'.repeat(8), arenaSecret: '5'.repeat(32) })
    expect(fetchMock).toHaveBeenCalledWith(`/v1/arena/whoami?anon_id=${'4'.repeat(8)}`, {
      method: 'GET',
      baseURL: 'https://example.test',
      headers: { authorization: `Bearer ${'5'.repeat(32)}` },
    })
  })

  it('arenaPairInit() POSTs Bearer-authed with anon_id body', async () => {
    const { client, fetchMock } = makeClient({
      ok: true,
      code: 'ABCDEF',
      expires_at: '2026-05-12T10:05:00Z',
      ttl_s: 300,
    })
    await client.arenaPairInit({ anonId: '6'.repeat(8), arenaSecret: '7'.repeat(32) })
    expect(fetchMock).toHaveBeenCalledWith('/v1/arena/pair/init', {
      method: 'POST',
      baseURL: 'https://example.test',
      body: { anon_id: '6'.repeat(8) },
      headers: { authorization: `Bearer ${'7'.repeat(32)}` },
    })
  })

  it('zonesList() and zoneDetail() call the catalog endpoints', async () => {
    const { client, fetchMock } = makeClient({ zones: [] })
    await client.zonesList()
    expect(fetchMock).toHaveBeenCalledWith('/v1/zones', { baseURL: 'https://example.test' })

    fetchMock.mockResolvedValueOnce({ id: 'forest', name_fr: 'Forêt' })
    await client.zoneDetail('forest')
    expect(fetchMock).toHaveBeenCalledWith('/v1/zones/forest', { baseURL: 'https://example.test' })
  })

  it('zoneExplore() and zoneFight() include Bearer auth', async () => {
    const { client, fetchMock } = makeClient({ ok: true })
    await client.zoneExplore({
      zoneId: 'forest',
      anonId: '8'.repeat(8),
      arenaSecret: '9'.repeat(32),
    })
    expect(fetchMock).toHaveBeenCalledWith('/v1/zone/forest/explore', {
      method: 'POST',
      baseURL: 'https://example.test',
      body: { anon_id: '8'.repeat(8) },
      headers: { authorization: `Bearer ${'9'.repeat(32)}` },
    })

    await client.zoneFight({ zoneId: 'forest', anonId: '8'.repeat(8), arenaSecret: '9'.repeat(32) })
    expect(fetchMock).toHaveBeenCalledWith('/v1/zone/forest/fight', {
      method: 'POST',
      baseURL: 'https://example.test',
      body: { anon_id: '8'.repeat(8) },
      headers: { authorization: `Bearer ${'9'.repeat(32)}` },
    })
  })
})
