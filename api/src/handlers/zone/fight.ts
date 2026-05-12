// POST /v1/zone/<zone_id>/fight — Bearer auth.
// Body : { anon_id }
//
// Sprint 4.6 — resolve the trainer's pending wild encounter as a server-
// side deterministic battle. Awards zone XP on victory, possibly levels
// up the trainer, increments lifetime_stats.zone_wins. Defeat = 0 XP,
// no penalty (the wild flees / faints, both sides survive narratively).
//
// Anti-cheat by construction :
//   1. Bearer auth required
//   2. The pending encounter MUST exist in KV under `zone:encounter:<id>` —
//      if absent, the client either fled already, explored too long ago
//      (5min TTL), or is trying to fabricate a fight from thin air.
//   3. Path zone_id MUST match the encounter's zone_id (no cross-zone
//      fight swaps).
//   4. Battle outcome resolved with the shared battle engine on a seeded
//      RNG derived from (anon_id, encounter.created_at, encounter.species)
//      so the same encounter resolves identically on retry.

import type { Env } from '../../env.d'
import { jsonResp } from '../../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../../lib/arena'
import {
  deletePendingEncounter,
  getArena,
  getPendingEncounter,
  getStats,
  putStats,
} from '../../lib/kv'
import { computeXpReward, levelFromTotalXp } from '../../data/zone-xp'
import { getZone } from '../../data/zones'
import { hashSeed, resolveBattle } from 'claude-pokemon-shared/battle'
import { LINEAGE_TO_TYPE } from 'claude-pokemon-shared/types'
import {
  ANON_ID_RE,
  type BattleParticipant,
  type BattleResult,
  type CombatType,
  type Lineage,
  type PendingEncounter,
} from '../../types'

/** Pick a lineage value whose collapsed CombatType matches the wild's
 * combat type. We don't add a "wild" or "other" lineage to the shared
 * package — instead we synthesize a battle participant whose lineage
 * happens to map back to the right type via LINEAGE_TO_TYPE.
 *
 * Result : the BattleResult's defender.lineage is a real lineage value,
 * but display-wise the web overrides it with `species_id` (Pidgey, not
 * Salamèche). Mechanics are correct, naming is correct because we don't
 * use the synthetic lineage for any display call.
 */
function syntheticLineageFor(combatType: CombatType): Lineage {
  // Walk LINEAGE_TO_TYPE and pick the first lineage that maps to this type.
  for (const [lineage, type] of Object.entries(LINEAGE_TO_TYPE) as [Lineage, CombatType][]) {
    if (type === combatType) return lineage
  }
  return 'eevee' // normal-typed fallback ; should never hit if SPECIES_COMBAT_TYPE is complete
}

function buildWildParticipant(
  encounter: PendingEncounter,
  speciesIdForDisplay: string,
): BattleParticipant {
  return {
    // The wild's "anon_id" is a synthetic, recognisable marker so the
    // battle log clearly indicates this is a wild fight, not a PvP one.
    // Format : 16 hex chars derived from species id to satisfy ANON_ID_RE.
    anon_id: ('w' + speciesIdForDisplay.replace(/[^a-f0-9]/g, '').padEnd(15, '0')).slice(0, 16),
    display_name: speciesIdForDisplay, // shown verbatim by the web's BattleStage
    lineage: syntheticLineageFor(encounter.combat_type),
    level: encounter.level,
    is_shiny: encounter.is_shiny,
  }
}

export async function handleZoneFight(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  const m = pathname.match(/^\/v1\/zone\/([a-z][a-z0-9-]{1,32})\/fight$/)
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

  // Pull the pending encounter — must exist and must match the zone in
  // the path. Either condition failing = client tampering or stale state.
  const encounter = await getPendingEncounter(env, anonId)
  if (!encounter) {
    return jsonResp({ error: 'no_pending_encounter' }, 404)
  }
  if (encounter.zone_id !== zoneId) {
    return jsonResp(
      {
        error: 'encounter_zone_mismatch',
        pending_zone_id: encounter.zone_id,
        path_zone_id: zoneId,
      },
      409,
    )
  }

  // Build battle participants. Player snapshot pulled from current stats
  // (web users) or from the arena team_snapshot (CLI users who never
  // submitted yet from the web).
  const stats = await getStats(env, anonId)
  const playerLevel = stats?.stats.active.current_level ?? arena.team_snapshot.level
  const playerLineage = (stats?.stats.active.lineage ?? arena.team_snapshot.lineage) as Lineage
  const playerIsShiny = stats?.stats.active.is_shiny ?? arena.team_snapshot.is_shiny

  const challenger: BattleParticipant = {
    anon_id: anonId,
    display_name: arena.team_snapshot.display_name ?? null,
    lineage: playerLineage,
    level: playerLevel,
    is_shiny: playerIsShiny,
  }
  const defender = buildWildParticipant(encounter, encounter.species_id)

  // Deterministic seed from (anon_id, encounter timestamp) so a retry on
  // network error replays identically. Mixing in species_id ensures
  // different encounters at the same instant produce different fights.
  const seed = hashSeed(
    `${anonId}:${encounter.created_at}:${encounter.species_id}:${encounter.level}`,
  )
  const battle: BattleResult = resolveBattle({
    challenger,
    defender,
    seed,
    createdAt: new Date().toISOString(),
  })

  // Consume the encounter regardless of outcome — both win and loss
  // resolve the pending state. Fleeing has its own endpoint.
  await deletePendingEncounter(env, anonId)

  const won = battle.winner === 'challenger'
  let xpReward = { amount: 0, breakdown: { base: 0, effectiveness_modifier: 0, pool_modifier: 0 } }
  let leveledUp = false
  let newLevel = playerLevel
  let newTotalXp = stats?.stats.lifetime.total_zone_xp ?? 0
  let newCurrentXp = stats?.stats.active.current_xp ?? 0

  if (won) {
    // Final-hit effectiveness drives the XP modifier — use the last turn's
    // effectiveness or default to 1.0.
    const lastTurn = battle.turns[battle.turns.length - 1]
    const finalEff = lastTurn?.effectiveness ?? 1
    xpReward = computeXpReward(encounter.level, finalEff, encounter.pool)

    newTotalXp = newTotalXp + xpReward.amount
    const lv = levelFromTotalXp(newTotalXp)
    // Zone XP only LEVELS UP — it never demotes a trainer who already
    // outranks the zone XP curve (e.g. a CLI player at Lv.50 who just
    // earned 35 XP from one web fight : their level stays Lv.50, not
    // drops to Lv.1). Web XP and CLI XP coexist as parallel level sources,
    // and the higher of the two wins (ADR-011).
    newLevel = Math.max(playerLevel, lv.level)
    leveledUp = newLevel > playerLevel
    // current_xp only meaningful if the zone XP curve is the active one
    // (web-native trainer). For CLI players still outranking the curve,
    // current_xp toward the NEXT level via zones is 0 until they catch up.
    newCurrentXp = newLevel === lv.level ? lv.currentXp : 0

    // Persist : update stats record (bootstrap if missing).
    const updated = stats ?? {
      anon_id: anonId,
      display_name: arena.team_snapshot.display_name ?? null,
      quote: null,
      bio: null,
      pinned_badges: [],
      origin: arena.origin,
      schema_version: 1,
      client_version: 'zone-fight',
      submitted_at: new Date().toISOString(),
      stats: {
        lifetime: {
          total_tokens: 0,
          total_evolutions: 0,
          total_shinies: 0,
          max_level: playerLevel,
          total_compagnons: 1,
          lineages_completed: [],
          games_won: 0,
          games_played: 0,
          total_zone_xp: 0,
          zone_wins: 0,
        },
        active: {
          lineage: playerLineage,
          current_level: playerLevel,
          is_shiny: playerIsShiny,
        },
        badges: [],
        pokedex_seen_count: 1,
        pokedex_seen_ids: [encounter.species_id],
      },
    }
    updated.stats.lifetime.total_zone_xp = newTotalXp
    updated.stats.lifetime.zone_wins = (updated.stats.lifetime.zone_wins ?? 0) + 1
    updated.stats.active.current_level = newLevel
    updated.stats.active.current_xp = newCurrentXp
    if (newLevel > (updated.stats.lifetime.max_level ?? 0)) {
      updated.stats.lifetime.max_level = newLevel
    }
    await putStats(env, updated)
  }

  return jsonResp({
    ok: true,
    won,
    battle,
    encounter,
    xp: xpReward,
    leveled_up: leveledUp,
    new_level: newLevel,
    new_total_zone_xp: newTotalXp,
    new_current_xp: newCurrentXp,
  })
}
