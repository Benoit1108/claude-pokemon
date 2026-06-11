// KV access primitives. All reads/writes go through here so we can mock
// in tests + change storage backend later if needed.
//
// Cloudflare KV constraint : expirationTtl MUST be ≥ 60 seconds. Shorter
// values cause `400 Invalid expiration_ttl`. We enforce this minimum in
// every set* helper via clampTtl ; the cooldown logic compares timestamps
// so a 20 s gameplay cooldown stored with TTL=60 still works correctly —
// the stale key just gets garbage-collected later.

import type { Env } from '../env.d'
import type {
  ArenaRecord,
  BattleReactions,
  BattleResult,
  IdentityProvider,
  KVRecord,
  LiveBattleRecord,
  PairRecord,
  PendingEncounter,
  SessionRecord,
  UserRecord,
} from '../types'
import {
  emptyReactions,
  LIVE_BATTLE_TTL_S,
  LIVE_BATTLE_INVITE_COOLDOWN_S,
  PAIR_CODE_TTL_S,
  SESSION_TTL_S,
} from '../types'

/** Cloudflare KV minimum expirationTtl. Any shorter value throws 400. */
const KV_MIN_TTL_S = 60

function clampTtl(ttlSeconds: number): number {
  return Math.max(KV_MIN_TTL_S, ttlSeconds)
}

export async function getStats(env: Env, anonId: string): Promise<KVRecord | null> {
  const raw = await env.STATS.get(`stats:${anonId}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as KVRecord
    // Sprint 4 lazy migration : legacy records have no origin field. Default
    // to 'cli' since the CLI was the only signup path before Sprint 4. Next
    // write back stamps the field permanently.
    if (!parsed.origin) {
      parsed.origin = 'cli'
    }
    return parsed
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
    expirationTtl: clampTtl(ttlSeconds),
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
    const parsed = JSON.parse(raw) as ArenaRecord
    // Sprint 4 lazy migration — same as getStats.
    if (!parsed.origin) {
      parsed.origin = 'cli'
    }
    return parsed
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
    expirationTtl: clampTtl(BATTLE_TTL_S),
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
    expirationTtl: clampTtl(BATTLE_TTL_S),
  })
}

// Sprint 2.13 (Q4) — KV key namespace migration. The legacy `arena_cd:`
// (underscore) is read for back-compat ; new writes use the hierarchical
// `arena:cd:` shape that matches every other key (`stats:`, `live:`,
// `pair:`, etc.). Cooldowns have ≤1h TTL so the legacy prefix self-flushes
// within an hour of deploy and the read-old branch can be removed in a
// follow-up cleanup commit.
export async function getArenaChallengeCooldown(env: Env, anonId: string): Promise<number | null> {
  let raw = await env.STATS.get(`arena:cd:${anonId}`)
  if (!raw) raw = await env.STATS.get(`arena_cd:${anonId}`)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

export async function setArenaChallengeCooldown(env: Env, anonId: string): Promise<void> {
  await env.STATS.put(`arena:cd:${anonId}`, String(Math.floor(Date.now() / 1000)), {
    expirationTtl: clampTtl(ARENA_CHALLENGE_COOLDOWN_S),
  })
}

export { ARENA_CHALLENGE_COOLDOWN_S }

// ---------------------------------------------------------------------------
// Live PvP (Sprint 2.10) — polling-based realtime battles
// ---------------------------------------------------------------------------

export async function getLiveBattle(env: Env, battleId: string): Promise<LiveBattleRecord | null> {
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
    expirationTtl: clampTtl(LIVE_BATTLE_TTL_S),
  })
}

export async function deleteLiveBattle(env: Env, battleId: string): Promise<void> {
  await env.STATS.delete(`live:${battleId}`)
}

// Sprint 2.13 (Q4) — same namespace migration as arena_cd: above.
export async function getLiveInviteCooldown(env: Env, anonId: string): Promise<number | null> {
  let raw = await env.STATS.get(`live:cd:${anonId}`)
  if (!raw) raw = await env.STATS.get(`live_cd:${anonId}`)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

export async function setLiveInviteCooldown(env: Env, anonId: string): Promise<void> {
  await env.STATS.put(`live:cd:${anonId}`, String(Math.floor(Date.now() / 1000)), {
    expirationTtl: clampTtl(LIVE_BATTLE_INVITE_COOLDOWN_S),
  })
}

export { LIVE_BATTLE_INVITE_COOLDOWN_S }

// ---------------------------------------------------------------------------
// Pair codes (Sprint 2.12) — one-shot CLI ↔ web secret handoff.
// ---------------------------------------------------------------------------

export async function getPairRecord(env: Env, code: string): Promise<PairRecord | null> {
  const raw = await env.STATS.get(`pair:${code}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PairRecord
  } catch {
    return null
  }
}

export async function putPairRecord(env: Env, code: string, record: PairRecord): Promise<void> {
  await env.STATS.put(`pair:${code}`, JSON.stringify(record), {
    expirationTtl: clampTtl(PAIR_CODE_TTL_S),
  })
}

export async function deletePairRecord(env: Env, code: string): Promise<void> {
  await env.STATS.delete(`pair:${code}`)
}

// ---------------------------------------------------------------------------
// Wild zones (Sprint 4.5)
// ---------------------------------------------------------------------------

/** Per-zone cooldown. Key shape : `zone:cd:<anon_id>:<zone_id>`. TTL set
 * by the caller (ZONE_EXPLORE_COOLDOWN_S). */
export async function getZoneCooldown(
  env: Env,
  anonId: string,
  zoneId: string,
): Promise<number | null> {
  const raw = await env.STATS.get(`zone:cd:${anonId}:${zoneId}`)
  if (!raw) return null
  const n = parseInt(raw, 10)
  return isNaN(n) ? null : n
}

export async function setZoneCooldown(
  env: Env,
  anonId: string,
  zoneId: string,
  ttlSeconds: number,
): Promise<void> {
  await env.STATS.put(`zone:cd:${anonId}:${zoneId}`, String(Math.floor(Date.now() / 1000)), {
    expirationTtl: clampTtl(ttlSeconds),
  })
}

/** Pending encounter slot. One per anon_id (newer rolls overwrite older).
 * Key shape : `zone:encounter:<anon_id>`. TTL set by the caller
 * (ZONE_ENCOUNTER_TTL_S, default 5 min). */
export async function getPendingEncounter(
  env: Env,
  anonId: string,
): Promise<PendingEncounter | null> {
  const raw = await env.STATS.get(`zone:encounter:${anonId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as PendingEncounter
  } catch {
    return null
  }
}

export async function putPendingEncounter(
  env: Env,
  anonId: string,
  encounter: PendingEncounter,
  ttlSeconds: number,
): Promise<void> {
  await env.STATS.put(`zone:encounter:${anonId}`, JSON.stringify(encounter), {
    expirationTtl: clampTtl(ttlSeconds),
  })
}

export async function deletePendingEncounter(env: Env, anonId: string): Promise<void> {
  await env.STATS.delete(`zone:encounter:${anonId}`)
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

// ── Auth : users, identities, sessions (Phase R2a) ──────────────────────────

export async function getUser(env: Env, userId: string): Promise<UserRecord | null> {
  const raw = await env.STATS.get(`user:${userId}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserRecord
  } catch {
    return null
  }
}

export async function putUser(env: Env, user: UserRecord): Promise<void> {
  await env.STATS.put(`user:${user.user_id}`, JSON.stringify(user))
}

/** `identity:<provider>:<externalId>` → user_id (stable across logins). */
export async function getIdentity(
  env: Env,
  provider: IdentityProvider,
  externalId: string,
): Promise<string | null> {
  return await env.STATS.get(`identity:${provider}:${externalId}`)
}

export async function putIdentity(
  env: Env,
  provider: IdentityProvider,
  externalId: string,
  userId: string,
): Promise<void> {
  await env.STATS.put(`identity:${provider}:${externalId}`, userId)
}

/** `session:<sha256(token)>` → SessionRecord. TTL-expired by KV. */
export async function getSession(env: Env, tokenHash: string): Promise<SessionRecord | null> {
  const raw = await env.STATS.get(`session:${tokenHash}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as SessionRecord
  } catch {
    return null
  }
}

export async function putSession(
  env: Env,
  tokenHash: string,
  record: SessionRecord,
): Promise<void> {
  await env.STATS.put(`session:${tokenHash}`, JSON.stringify(record), {
    expirationTtl: clampTtl(SESSION_TTL_S),
  })
}

export async function deleteSession(env: Env, tokenHash: string): Promise<void> {
  await env.STATS.delete(`session:${tokenHash}`)
}

/** Reverse map `anonlink:<anon_id>` → user_id : which user has claimed a legacy
 * anon account (ADR-010). Used for anti-takeover (one anon → at most one user). */
export async function getAnonLink(env: Env, anonId: string): Promise<string | null> {
  return await env.STATS.get(`anonlink:${anonId}`)
}

export async function putAnonLink(env: Env, anonId: string, userId: string): Promise<void> {
  await env.STATS.put(`anonlink:${anonId}`, userId)
}
