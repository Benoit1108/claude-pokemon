// KV access primitives. All reads/writes go through here so we can mock
// in tests + change storage backend later if needed.

import type { Env } from '../env.d'
import type { KVRecord } from '../types'

export async function getStats(env: Env, anonId: string): Promise<KVRecord | null> {
  const raw = await env.STATS.get(`stats:${anonId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as KVRecord
  } catch {
    return null
  }
}

export async function putStats(env: Env, record: KVRecord): Promise<void> {
  await env.STATS.put(`stats:${record.anon_id}`, JSON.stringify(record))
}

export async function deleteStats(env: Env, anonId: string): Promise<void> {
  await env.STATS.delete(`stats:${anonId}`)
}

export async function getCooldown(env: Env, anonId: string): Promise<number | null> {
  const raw = await env.STATS.get(`cooldown:${anonId}`)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

export async function setCooldown(env: Env, anonId: string, ttlSeconds: number): Promise<void> {
  await env.STATS.put(`cooldown:${anonId}`, String(Math.floor(Date.now() / 1000)), {
    expirationTtl: ttlSeconds,
  })
}

export async function deleteCooldown(env: Env, anonId: string): Promise<void> {
  await env.STATS.delete(`cooldown:${anonId}`)
}

export async function listAllStats(env: Env): Promise<KVRecord[]> {
  // KV list paginated. For MVP: assume <1000 records, single page suffices.
  // Beyond ~1000 entries we'd need pagination + cache.
  const list = await env.STATS.list({ prefix: 'stats:' })
  const records: KVRecord[] = []
  for (const key of list.keys) {
    const raw = await env.STATS.get(key.name)
    if (raw) {
      try {
        records.push(JSON.parse(raw) as KVRecord)
      } catch {
        /* skip corrupt */
      }
    }
  }
  return records
}
