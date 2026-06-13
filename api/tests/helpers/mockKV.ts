// In-memory KVNamespace mock — implements the subset of the API our handlers
// actually use (get/put/list/delete). Keeps unit tests fast and dependency-free
// (no miniflare, no Worker runtime).

import type { KVNamespace, KVNamespaceListResult } from '@cloudflare/workers-types'
import type { Env } from '../../src/env.d'

interface StoredValue {
  value: string
  expiresAt?: number
}

export class MockKV {
  private store = new Map<string, StoredValue>()

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt && entry.expiresAt < Date.now() / 1000) {
      this.store.delete(key)
      return null
    }
    return entry.value
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    const expiresAt = options?.expirationTtl ? Date.now() / 1000 + options.expirationTtl : undefined
    this.store.set(key, { value, expiresAt })
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }

  // Faithful-ish KV list. Real KV paginates: a single `list` returns at most
  // `limit` keys (default 1000) plus a `cursor` + `list_complete:false` when
  // more keys match the prefix. We honour `limit`/`cursor` so cursor-following
  // consumers can be exercised, while staying backward-compatible: with no
  // `limit` (and a sub-page key count) the whole set comes back in one page
  // with `list_complete:true`, exactly as before.
  async list(options?: {
    prefix?: string
    limit?: number
    cursor?: string
  }): Promise<KVNamespaceListResult<unknown, string>> {
    const prefix = options?.prefix ?? ''
    const allNames = [...this.store.keys()].filter(k => k.startsWith(prefix)).sort()

    const start = options?.cursor ? this.decodeCursor(options.cursor) : 0
    // KV's real default page size is 1000; mirror that so unbounded lists of a
    // small store still complete in one page (backward-compatible).
    const limit = options?.limit ?? 1000
    const page = allNames.slice(start, start + limit)
    const next = start + page.length
    const complete = next >= allNames.length

    const result: Record<string, unknown> = {
      keys: page.map(name => ({ name })),
      list_complete: complete,
      cacheStatus: null,
    }
    if (!complete) result.cursor = this.encodeCursor(next)
    return result as unknown as KVNamespaceListResult<unknown, string>
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(`offset:${offset}`).toString('base64')
  }

  private decodeCursor(cursor: string): number {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8')
    const n = parseInt(decoded.replace(/^offset:/, ''), 10)
    return isNaN(n) ? 0 : n
  }

  // Test utilities (not part of KVNamespace API)
  clear() {
    this.store.clear()
  }

  size() {
    return this.store.size
  }

  has(key: string) {
    return this.store.has(key)
  }
}

export function makeEnv(kv?: MockKV): Env {
  return { STATS: (kv || new MockKV()) as unknown as KVNamespace }
}
