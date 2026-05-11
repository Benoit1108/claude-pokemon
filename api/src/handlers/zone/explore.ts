// POST /v1/zone/<zone_id>/explore — Bearer auth.
// Body : { anon_id }
//
// Sprint 4.5 — web-native exploration / encounter roll. Anti-cheat by
// construction :
//   - 20 s cooldown per (anon_id, zone_id) → ~3 explores/min/zone max
//   - level bracket : trainer below `zone.level_min - 10` is locked out
//   - encounter species picked from the zone's wild_pool (server-side roll),
//     client can't fabricate a "Mewtwo from Route 1" type cheat
//   - the resulting encounter is stored in KV as a `PendingEncounter`
//     under the trainer's anon_id. Sprint 4.6's /fight handler MUST find
//     a matching pending encounter or reject — closes the door on
//     replay attacks.
//
// Outcomes :
//   70 % wild encounter → returns { kind: 'encounter', encounter: {...} }
//   25 % item drop       → returns { kind: 'item', item: {...} }
//    5 % nothing          → returns { kind: 'nothing' }
//
// Pokédex side-effect : the trainer's `pokedex_seen_ids` gains the species
// id even if they later flee (matches canon — "Seen" updates on encounter
// regardless of capture).

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import {
  getArena,
  getStats,
  getZoneCooldown,
  putPendingEncounter,
  putStats,
  setZoneCooldown,
} from '../../lib/kv'
import {
  getZone,
  isZoneLocked,
  ZONE_ENCOUNTER_LEGENDARY_WEIGHT,
  ZONE_ENCOUNTER_RARE_WEIGHT,
  ZONE_ENCOUNTER_TTL_S,
  ZONE_EXPLORE_COOLDOWN_S,
  ZONE_ROLL_ENCOUNTER,
  ZONE_ROLL_ITEM,
  ZONE_SHINY_RATE,
  type WildZone,
} from '../../data/zones'
import { speciesToCombatType } from '../../data/species-types'
import {
  ANON_ID_RE,
  POKEDEX_MAX_IDS,
  type ItemDrop,
  type PendingEncounter,
} from '../../types'

interface ExploreSuccess {
  ok: true
  zone_id: string
  cooldown_remaining_s: number
}
type ExploreEncounter = ExploreSuccess & {
  kind: 'encounter'
  encounter: PendingEncounter
}
type ExploreItem = ExploreSuccess & {
  kind: 'item'
  item: ItemDrop
}
type ExploreNothing = ExploreSuccess & {
  kind: 'nothing'
}

const ITEM_POOL: ItemDrop[] = [
  { kind: 'berry', emoji: '🍒' },
  { kind: 'berry', emoji: '🫐' },
  { kind: 'potion', emoji: '🧪' },
  { kind: 'pokeball', emoji: '⚪' },
  { kind: 'rare-candy', emoji: '🍬' },
]

function pickFrom<T>(arr: readonly T[]): T | null {
  if (arr.length === 0) return null
  return arr[Math.floor(Math.random() * arr.length)] ?? null
}

/** Pick a species id from the zone's pools, weighted toward common. */
function rollSpecies(zone: WildZone): { species_id: string; pool: PendingEncounter['pool'] } | null {
  const roll = Math.random()
  if (
    roll < ZONE_ENCOUNTER_LEGENDARY_WEIGHT &&
    zone.legendary_pool &&
    zone.legendary_pool.length > 0
  ) {
    const s = pickFrom(zone.legendary_pool)
    if (s) return { species_id: s, pool: 'legendary' }
  }
  if (
    roll < ZONE_ENCOUNTER_LEGENDARY_WEIGHT + ZONE_ENCOUNTER_RARE_WEIGHT &&
    zone.rare_pool &&
    zone.rare_pool.length > 0
  ) {
    const s = pickFrom(zone.rare_pool)
    if (s) return { species_id: s, pool: 'rare' }
  }
  const s = pickFrom(zone.wild_pool)
  return s ? { species_id: s, pool: 'common' } : null
}

/** Wild encounter level : uniform within the zone's bracket. */
function rollLevel(zone: WildZone): number {
  return (
    zone.level_min +
    Math.floor(Math.random() * (zone.level_max - zone.level_min + 1))
  )
}

export async function handleZoneExplore(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  const m = pathname.match(/^\/v1\/zone\/([a-z][a-z0-9-]{1,32})\/explore$/)
  if (!m) return jsonResp({ error: 'invalid_path' }, 400)
  const zoneId = m[1]!

  const zone = getZone(zoneId)
  if (!zone) return jsonResp({ error: 'zone_not_found' }, 404)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }
  if (!body || typeof body !== 'object') return jsonResp({ error: 'body_required' }, 400)
  const b = body as { anon_id?: string }
  if (typeof b.anon_id !== 'string' || !ANON_ID_RE.test(b.anon_id)) {
    return jsonResp({ error: 'invalid_anon_id' }, 400)
  }
  const anonId = b.anon_id

  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const arena = await getArena(env, anonId)
  if (!arena) return jsonResp({ error: 'arena_not_enabled' }, 403)
  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, arena.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  // Level bracket lockout. Trainer level pulled from stats record ; if no
  // record (web signup before any submit), default to the team_snapshot's
  // level which was set at /enable time (Lv.1 from /signup).
  const stats = await getStats(env, anonId)
  const trainerLevel = stats?.stats.active.current_level ?? arena.team_snapshot.level
  if (isZoneLocked(zone, trainerLevel)) {
    return jsonResp(
      {
        error: 'zone_locked',
        reason: 'level_too_low',
        zone_level_min: zone.level_min,
        trainer_level: trainerLevel,
        message: `Cette zone exige au moins le niveau ${zone.level_min - 10}. Tu es niveau ${trainerLevel}.`,
      },
      403,
    )
  }

  // Per-zone cooldown.
  const lastExplore = await getZoneCooldown(env, anonId, zoneId)
  if (lastExplore !== null) {
    const secsLeft = Math.ceil(ZONE_EXPLORE_COOLDOWN_S - (Date.now() / 1000 - lastExplore))
    if (secsLeft > 0) {
      return jsonResp(
        {
          error: 'rate_limited',
          cooldown_remaining_s: secsLeft,
          message: `Tu as déjà exploré cette zone. Reviens dans ${secsLeft} s.`,
        },
        429,
      )
    }
  }

  // Set the cooldown FIRST (so a slow encounter roll can't be exploited).
  await setZoneCooldown(env, anonId, zoneId, ZONE_EXPLORE_COOLDOWN_S)

  // Roll the outcome : encounter / item / nothing.
  const roll = Math.random()
  const cooldownRemaining = ZONE_EXPLORE_COOLDOWN_S

  if (roll < ZONE_ROLL_ENCOUNTER) {
    const sp = rollSpecies(zone)
    if (!sp) {
      // Zone has no wild pool at all — config error. Fall through to nothing.
      const res: ExploreNothing = {
        ok: true,
        zone_id: zoneId,
        cooldown_remaining_s: cooldownRemaining,
        kind: 'nothing',
      }
      return jsonResp(res)
    }
    const now = new Date()
    const expires = new Date(now.getTime() + ZONE_ENCOUNTER_TTL_S * 1000)
    const encounter: PendingEncounter = {
      zone_id: zoneId,
      species_id: sp.species_id,
      level: rollLevel(zone),
      is_shiny: Math.random() < ZONE_SHINY_RATE,
      pool: sp.pool,
      // Sprint 4.6 — cache the collapsed combat type now so /fight doesn't
      // need to look it up server-side later.
      combat_type: speciesToCombatType(sp.species_id),
      created_at: now.toISOString(),
      expires_at: expires.toISOString(),
    }
    await putPendingEncounter(env, anonId, encounter, ZONE_ENCOUNTER_TTL_S)

    // Sprint 2.11 — pokedex_seen_ids auto-update. The trainer "saw" the
    // species the moment the encounter is rolled, whether or not they
    // engage. Mirrors canon.
    if (stats) {
      const seen = new Set(stats.stats.pokedex_seen_ids ?? [])
      if (!seen.has(sp.species_id)) {
        seen.add(sp.species_id)
        stats.stats.pokedex_seen_ids = Array.from(seen).slice(0, POKEDEX_MAX_IDS)
        stats.stats.pokedex_seen_count = stats.stats.pokedex_seen_ids.length
        await putStats(env, stats)
      }
    }

    const res: ExploreEncounter = {
      ok: true,
      zone_id: zoneId,
      cooldown_remaining_s: cooldownRemaining,
      kind: 'encounter',
      encounter,
    }
    return jsonResp(res)
  }

  if (roll < ZONE_ROLL_ENCOUNTER + ZONE_ROLL_ITEM) {
    const item = pickFrom(ITEM_POOL)
    const res: ExploreItem = {
      ok: true,
      zone_id: zoneId,
      cooldown_remaining_s: cooldownRemaining,
      kind: 'item',
      item: item ?? { kind: 'berry', emoji: '🍒' },
    }
    return jsonResp(res)
  }

  const res: ExploreNothing = {
    ok: true,
    zone_id: zoneId,
    cooldown_remaining_s: cooldownRemaining,
    kind: 'nothing',
  }
  return jsonResp(res)
}
