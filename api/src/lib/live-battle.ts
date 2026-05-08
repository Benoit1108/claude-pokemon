// Helpers shared between the live PvP handlers (Sprint 2.10).
// Kept thin — most of the work happens in the handlers themselves. The two
// pieces here are :
//   - liveBattleView(record)  → strip secret_hash + opponent's pending action
//   - hasExpired(record)      → inactivity check used at every read
//   - resolveLiveTurn(...)    → mutate a record in place once both sides have
//                               committed actions (Sprint 2.10b)

import {
  ARENA_MAX_TURNS,
  LIVE_BATTLE_INACTIVITY_S,
  LINEAGE_TO_TYPE,
  type BattleSide,
  type BattleTurn,
  type LiveBattleRecord,
  type LiveBattleSide,
  type LiveBattleView,
} from '../types'
import { TYPE_CHART, attackPower, hashSeed, maxHp, mulberry32 } from './battle'
import { movesForStage, stageFor, type Move } from './moves'

export function liveBattleView(record: LiveBattleRecord): LiveBattleView {
  const c = record.challenger
  const d = record.defender
  return {
    battle_id: record.battle_id,
    state: record.state,
    challenger: {
      anon_id: c.anon_id,
      snapshot: c.snapshot,
      hp: c.hp,
      has_pending_action: c.pending_action !== null,
    },
    defender:
      'snapshot' in d
        ? {
            anon_id: d.anon_id,
            snapshot: d.snapshot,
            hp: d.hp,
            has_pending_action: d.pending_action !== null,
          }
        : { anon_id: d.anon_id, snapshot: null, hp: null, has_pending_action: false },
    turn_no: record.turn_no,
    turn_log: record.turn_log,
    winner: record.winner,
    reason: record.reason,
    created_at: record.created_at,
    last_activity_at: record.last_activity_at,
    forfeit_by: record.forfeit_by,
  }
}

/** True if no activity for ≥LIVE_BATTLE_INACTIVITY_S. Caller should mutate the
 * record to state='expired' + reason='expired' before re-persisting. */
export function hasExpired(record: LiveBattleRecord, nowMs: number = Date.now()): boolean {
  if (record.state === 'finished' || record.state === 'expired' || record.state === 'abandoned') {
    return false
  }
  const last = Date.parse(record.last_activity_at)
  if (isNaN(last)) return false
  return nowMs - last > LIVE_BATTLE_INACTIVITY_S * 1000
}

/** Resolve which side acts first in a turn. Higher level wins ; ties broken
 * by a deterministic coin flip seeded off battle_id + turn_no (so the order
 * is reproducible for replay/GIF). */
function firstActor(record: LiveBattleRecord): BattleSide {
  const c = record.challenger.snapshot
  if (!('snapshot' in record.defender)) return 'challenger'
  const d = record.defender.snapshot
  if (c.level > d.level) return 'challenger'
  if (d.level > c.level) return 'defender'
  // Coin-flip seeded off (battle_id, turn_no) so re-resolves of the same turn
  // pick the same actor — important if the worker retries.
  const rng = mulberry32(hashSeed(`${record.battle_id}:${record.turn_no}:order`))
  return rng() < 0.5 ? 'challenger' : 'defender'
}

/** Compute one strike's damage given the attacker move + defender type. */
function rollStrike(args: {
  attackerLevel: number
  attackerIsShiny: boolean
  attackerMove: Move
  defenderLineage: string
  rng: () => number
}): { damage: number; effectiveness: number; critical: boolean } {
  const atk = attackPower(args.attackerLevel, args.attackerIsShiny)
  const moveType = args.attackerMove.type
  const defType = LINEAGE_TO_TYPE[args.defenderLineage as keyof typeof LINEAGE_TO_TYPE] ?? 'normal'
  const effectiveness = TYPE_CHART[moveType][defType]
  const variance = 0.85 + args.rng() * 0.3 // 0.85..1.15
  const critical = args.rng() < 0.0625
  const critMult = critical ? 1.5 : 1
  const raw = (atk * effectiveness * args.attackerMove.power * variance * critMult) / 4
  return { damage: Math.max(1, Math.round(raw)), effectiveness, critical }
}

/** Look up a move by its `name` field within a participant's stage pool. The
 * pool comes from movesForStage(stageFor(lineage, level)). Returns null if the
 * move is not in this side's pool — caller should reject with 400. */
export function lookupMoveForSide(side: LiveBattleSide, moveId: string): Move | null {
  const stage = stageFor(side.snapshot.lineage, side.snapshot.level)
  const pool = movesForStage(stage)
  return pool.find(m => m.name === moveId) ?? null
}

/**
 * Resolve a single turn given both sides have committed an action.
 * Mutates the record in place : pushes 1-2 BattleTurn entries into turn_log,
 * decrements HP, clears pending_action, advances turn_no, transitions state
 * to 'finished' when someone is KO'd or the turn cap is reached.
 *
 * Both actors strike in the same turn (firstActor first, then the other). If
 * the first strike KOs the opponent the second strike is skipped.
 */
export function resolveLiveTurn(record: LiveBattleRecord): void {
  if (record.state !== 'active') return
  if (!('snapshot' in record.defender)) return
  const c = record.challenger
  const d = record.defender as LiveBattleSide
  const cAction = c.pending_action
  const dAction = d.pending_action
  if (!cAction || !dAction) return

  const cMove = lookupMoveForSide(c, cAction)
  const dMove = lookupMoveForSide(d, dAction)
  if (!cMove || !dMove) {
    // Should be rejected at /commit time, but guard so we never crash.
    return
  }

  const rng = mulberry32(hashSeed(`${record.battle_id}:${record.turn_no}:resolve`))
  const order: BattleSide[] =
    firstActor(record) === 'challenger' ? ['challenger', 'defender'] : ['defender', 'challenger']

  const turns: BattleTurn[] = []
  for (const actor of order) {
    const isChallenger = actor === 'challenger'
    const attackerSide = isChallenger ? c : d
    const defenderSide = isChallenger ? d : c
    if (attackerSide.hp <= 0 || defenderSide.hp <= 0) continue

    const move = isChallenger ? cMove : dMove
    const { damage, effectiveness, critical } = rollStrike({
      attackerLevel: attackerSide.snapshot.level,
      attackerIsShiny: attackerSide.snapshot.is_shiny,
      attackerMove: move,
      defenderLineage: defenderSide.snapshot.lineage,
      rng,
    })
    defenderSide.hp = Math.max(0, defenderSide.hp - damage)
    turns.push({
      turn: record.turn_log.length + turns.length + 1,
      actor,
      damage,
      effectiveness,
      critical,
      defender_hp_after: defenderSide.hp,
    })
    if (defenderSide.hp <= 0) break
  }

  record.turn_log.push(...turns)

  // Reset pending actions for the next turn.
  c.pending_action = null
  d.pending_action = null
  record.turn_no += 1
  record.last_activity_at = new Date().toISOString()

  // End conditions.
  if (c.hp <= 0 && d.hp <= 0) {
    record.state = 'finished'
    record.winner = 'draw'
    record.reason = 'ko'
  } else if (d.hp <= 0) {
    record.state = 'finished'
    record.winner = 'challenger'
    record.reason = 'ko'
  } else if (c.hp <= 0) {
    record.state = 'finished'
    record.winner = 'defender'
    record.reason = 'ko'
  } else if (record.turn_no > ARENA_MAX_TURNS) {
    record.state = 'finished'
    record.reason = 'turn_limit'
    const cMax = maxHp(c.snapshot.level, c.snapshot.is_shiny)
    const dMax = maxHp(d.snapshot.level, d.snapshot.is_shiny)
    const cPct = c.hp / cMax
    const dPct = d.hp / dMax
    record.winner = cPct > dPct ? 'challenger' : dPct > cPct ? 'defender' : 'draw'
  }
}
