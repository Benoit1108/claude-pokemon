// Helpers shared between the live PvP handlers (Sprint 2.10).
// Kept thin — most of the work happens in the handlers themselves. The two
// pieces here are :
//   - liveBattleView(record)  → strip secret_hash + opponent's pending action
//   - hasExpired(record)      → inactivity check used at every read

import { LIVE_BATTLE_INACTIVITY_S, type LiveBattleRecord, type LiveBattleView } from '../types'

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
