import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaOpponents } from '../../../src/handlers/arena/opponents'
import { putArena } from '../../../src/lib/kv'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import type { ArenaRecord } from '../../../src/types'

function record(
  anonId: string,
  level: number,
  lineage: ArenaRecord['team_snapshot']['lineage'],
): ArenaRecord {
  return {
    anon_id: anonId,
    secret_hash: 'f'.repeat(64),
    team_snapshot: {
      anon_id: anonId,
      display_name: anonId,
      lineage,
      level,
      is_shiny: false,
    },
    enabled_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-05-06T10:00:00Z',
  }
}

describe('handleArenaOpponents', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('returns empty list when no trainers enabled', async () => {
    const url = new URL('https://x/v1/arena/opponents')
    const res = await handleArenaOpponents(url, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { opponents: unknown[]; total: number }
    expect(body.opponents).toEqual([])
    expect(body.total).toBe(0)
  })

  it('returns sanitized opponent snapshots (no secret_hash leaked)', async () => {
    await putArena(env, record('aaaaaaaa', 30, 'fire'))
    const url = new URL('https://x/v1/arena/opponents')
    const res = await handleArenaOpponents(url, env)
    const body = (await res.json()) as { opponents: Record<string, unknown>[] }
    expect(body.opponents.length).toBe(1)
    expect(body.opponents[0]).not.toHaveProperty('secret_hash')
    expect(body.opponents[0]).toMatchObject({
      anon_id: 'aaaaaaaa',
      lineage: 'fire',
      level: 30,
    })
  })

  it('sorts opponents by level desc', async () => {
    await putArena(env, record('aaaaaaaa', 10, 'fire'))
    await putArena(env, record('bbbbbbbb', 50, 'water'))
    await putArena(env, record('cccccccc', 30, 'grass'))
    const url = new URL('https://x/v1/arena/opponents')
    const res = await handleArenaOpponents(url, env)
    const body = (await res.json()) as { opponents: { level: number }[] }
    expect(body.opponents.map(o => o.level)).toEqual([50, 30, 10])
  })

  it('respects the limit query param', async () => {
    for (let i = 0; i < 5; i++) {
      await putArena(env, record('a'.repeat(7) + i, i + 1, 'fire'))
    }
    const url = new URL('https://x/v1/arena/opponents?limit=3')
    const res = await handleArenaOpponents(url, env)
    const body = (await res.json()) as { opponents: unknown[]; total: number }
    expect(body.opponents.length).toBe(3)
    expect(body.total).toBe(5)
  })

  it('clamps limit to [1, 200]', async () => {
    const url1 = new URL('https://x/v1/arena/opponents?limit=999')
    const r1 = await handleArenaOpponents(url1, env)
    expect(r1.status).toBe(200)
    const url2 = new URL('https://x/v1/arena/opponents?limit=0')
    const r2 = await handleArenaOpponents(url2, env)
    expect(r2.status).toBe(200)
  })
})
