// Exercises MockKV's paginated `list` (limit/cursor). The real Cloudflare KV
// `list` returns at most `limit` keys plus a cursor + `list_complete:false`
// when more match the prefix; the mock now mirrors that so any cursor-following
// consumer can be tested. These tests assert the page boundaries directly and
// drive a cursor loop that aggregates across pages.

import { describe, it, expect, beforeEach } from 'vitest'
import { MockKV } from './mockKV'
import type { KVRecord } from '../../src/types'

function statsRecord(anonId: string, totalTokens: number): KVRecord {
  return {
    anon_id: anonId,
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
        total_tokens: totalTokens,
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
}

describe('MockKV.list — pagination (limit/cursor)', () => {
  let kv: MockKV

  beforeEach(async () => {
    kv = new MockKV()
    for (let i = 0; i < 25; i++) {
      await kv.put(
        `stats:id${String(i).padStart(3, '0')}`,
        JSON.stringify(statsRecord(`id${i}`, i)),
      )
    }
    // A non-matching key to prove prefix filtering survives pagination.
    await kv.put('other:zzz', 'noise')
  })

  it('returns everything in one complete page when no limit is given (backward-compatible)', async () => {
    const page = await kv.list({ prefix: 'stats:' })
    expect(page.keys).toHaveLength(25)
    expect(page.list_complete).toBe(true)
    expect((page as { cursor?: string }).cursor).toBeUndefined()
  })

  it('caps a page at `limit` and returns a cursor + list_complete:false when more remain', async () => {
    const page = await kv.list({ prefix: 'stats:', limit: 10 })
    expect(page.keys).toHaveLength(10)
    expect(page.list_complete).toBe(false)
    expect((page as { cursor?: string }).cursor).toBeTruthy()
    // First page is the lexicographically-lowest 10 keys.
    expect(page.keys[0]?.name).toBe('stats:id000')
    expect(page.keys[9]?.name).toBe('stats:id009')
  })

  it('the final page sets list_complete:true and drops the cursor', async () => {
    const p1 = await kv.list({ prefix: 'stats:', limit: 20 })
    expect(p1.list_complete).toBe(false)
    const cursor = (p1 as { cursor?: string }).cursor
    const p2 = await kv.list({ prefix: 'stats:', limit: 20, cursor })
    expect(p2.keys).toHaveLength(5) // 25 - 20
    expect(p2.list_complete).toBe(true)
    expect((p2 as { cursor?: string }).cursor).toBeUndefined()
  })

  it('a cursor-following loop aggregates every matching record across pages with no dupes', async () => {
    const seen: string[] = []
    let cursor: string | undefined
    let pages = 0
    do {
      const page: Awaited<ReturnType<MockKV['list']>> & { cursor?: string } = await kv.list({
        prefix: 'stats:',
        limit: 7,
        cursor,
      })
      pages += 1
      for (const k of page.keys) {
        const raw = await kv.get(k.name)
        expect(raw).not.toBeNull()
        seen.push((JSON.parse(raw as string) as KVRecord).anon_id)
      }
      cursor = page.list_complete ? undefined : page.cursor
    } while (cursor)

    expect(pages).toBeGreaterThan(1) // 25 / 7 → 4 pages
    expect(seen).toHaveLength(25)
    expect(new Set(seen).size).toBe(25) // no key visited twice
    // The "other:" key never leaked into the stats: prefix scan.
    expect(seen.some(id => id.startsWith('id'))).toBe(true)
  })

  it('a limit larger than the matching set returns one complete page', async () => {
    const page = await kv.list({ prefix: 'stats:', limit: 1000 })
    expect(page.keys).toHaveLength(25)
    expect(page.list_complete).toBe(true)
  })
})
