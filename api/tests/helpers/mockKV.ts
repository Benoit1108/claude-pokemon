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

  async list(options?: { prefix?: string }): Promise<KVNamespaceListResult<unknown, string>> {
    const prefix = options?.prefix ?? ''
    const keys = [...this.store.keys()].filter(k => k.startsWith(prefix)).map(name => ({ name }))
    return {
      keys,
      list_complete: true,
      cacheStatus: null,
    } as unknown as KVNamespaceListResult<unknown, string>
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
