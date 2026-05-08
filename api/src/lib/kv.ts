// KV access primitives. All reads/writes go through here so we can mock
// in tests + change storage backend later if needed.

import type { Env } from '../env.d'
import type {
  ArenaRecord,
  BattleReactions,
  BattleResult,
  KVRecord,
  LiveBattleRecord,
} from '../types'
import { emptyReactions, LIVE_BATTLE_TTL_S, LIVE_BATTLE_INVITE_COOLDOWN_S } from '../types'

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

// ---------------------------------------------------------------------------
// Arena (Sprint 2.3) — opt-in trainers + persisted battle records
// ---------------------------------------------------------------------------

const BATTLE_TTL_S = 30 * 24 * 60 * 60 // 30 days
const ARENA_CHALLENGE_COOLDOWN_S = 60 * 60 // 1 hour between challenges

export async function getArena(env: Env, anonId: string): Promise<ArenaRecord | null> {
  const raw = await env.STATS.get(`arena:${anonId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ArenaRecord
  } catch {
    return null
  }
}

export async function putArena(env: Env, record: ArenaRecord): Promise<void> {
  await env.STATS.put(`arena:${record.anon_id}`, JSON.stringify(record))
}

export async function deleteArena(env: Env, anonId: string): Promise<void> {
  await env.STATS.delete(`arena:${anonId}`)
}

export async function listAllArenas(env: Env): Promise<ArenaRecord[]> {
  const list = await env.STATS.list({ prefix: 'arena:' })
  const records: ArenaRecord[] = []
  for (const key of list.keys) {
    const raw = await env.STATS.get(key.name)
    if (raw) {
      try {
        records.push(JSON.parse(raw) as ArenaRecord)
      } catch {
        /* skip corrupt */
      }
    }
  }
  return records
}

export async function getBattle(env: Env, battleId: string): Promise<BattleResult | null> {
  const raw = await env.STATS.get(`battle:${battleId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as BattleResult
  } catch {
    return null
  }
}

export async function putBattle(env: Env, battle: BattleResult): Promise<void> {
  if (!battle.battle_id) throw new Error('putBattle requires battle_id set')
  await env.STATS.put(`battle:${battle.battle_id}`, JSON.stringify(battle), {
    expirationTtl: BATTLE_TTL_S,
  })
}

// ── Battle reactions (Sprint 2.8b) ────────────────────────────────────────
export async function getBattleReactions(env: Env, battleId: string): Promise<BattleReactions> {
  const raw = await env.STATS.get(`react:${battleId}`)
  if (!raw) return emptyReactions()
  try {
    const parsed = JSON.parse(raw) as Partial<BattleReactions>
    return {
      counts: { ...emptyReactions().counts, ...(parsed.counts ?? {}) },
      voters: parsed.voters ?? {},
    }
  } catch {
    return emptyReactions()
  }
}

export async function putBattleReactions(
  env: Env,
  battleId: string,
  reactions: BattleReactions,
): Promise<void> {
  await env.STATS.put(`react:${battleId}`, JSON.stringify(reactions), {
    expirationTtl: BATTLE_TTL_S,
  })
}

export async function getArenaChallengeCooldown(env: Env, anonId: string): Promise<number | null> {
  const raw = await env.STATS.get(`arena_cd:${anonId}`)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

export async function setArenaChallengeCooldown(env: Env, anonId: string): Promise<void> {
  await env.STATS.put(`arena_cd:${anonId}`, String(Math.floor(Date.now() / 1000)), {
    expirationTtl: ARENA_CHALLENGE_COOLDOWN_S,
  })
}

export { ARENA_CHALLENGE_COOLDOWN_S }

// ---------------------------------------------------------------------------
// Live PvP (Sprint 2.10) — polling-based realtime battles
// ---------------------------------------------------------------------------

export async function getLiveBattle(
  env: Env,
  battleId: string,
): Promise<LiveBattleRecord | null> {
  const raw = await env.STATS.get(`live:${battleId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as LiveBattleRecord
  } catch {
    return null
  }
}

export async function putLiveBattle(env: Env, record: LiveBattleRecord): Promise<void> {
  await env.STATS.put(`live:${record.battle_id}`, JSON.stringify(record), {
    expirationTtl: LIVE_BATTLE_TTL_S,
  })
}

export async function deleteLiveBattle(env: Env, battleId: string): Promise<void> {
  await env.STATS.delete(`live:${battleId}`)
}

export async function getLiveInviteCooldown(env: Env, anonId: string): Promise<number | null> {
  const raw = await env.STATS.get(`live_cd:${anonId}`)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

export async function setLiveInviteCooldown(env: Env, anonId: string): Promise<void> {
  await env.STATS.put(`live_cd:${anonId}`, String(Math.floor(Date.now() / 1000)), {
    expirationTtl: LIVE_BATTLE_INVITE_COOLDOWN_S,
  })
}

export { LIVE_BATTLE_INVITE_COOLDOWN_S }

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
