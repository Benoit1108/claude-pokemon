// resolveLiveTurn end-condition coverage (Sprint 2.10b). The handler tests
// (tests/handlers/arena/live.test.ts) drive resolution through the full
// invite→accept→commit flow, but the turn-cap tiebreak and the various
// winner/reason branches are hard to reach that way (they need precise HP
// states). Here we build LiveBattleRecords by hand and call resolveLiveTurn
// directly, controlling HP / turn_no so each terminal branch is deterministic.
//
// Determinism: damage carries RNG (variance + crit), so we never rely on a
// specific damage value. KO branches pre-set the losing HP to 0; the turn-cap
// tiebreak uses an immune matchup (normal move vs ghost, ghost move vs normal →
// 0 damage both ways) so HP is unchanged and the HP% comparison is exact.

import { describe, it, expect } from 'vitest'
import { resolveLiveTurn, lookupMoveForSide } from '../../src/lib/live-battle'
import { ARENA_MAX_TURNS, type LiveBattleRecord, type LiveBattleSide } from '../../src/types'
import { maxHp } from 'claude-pokemon-shared/battle'
import { movesForParticipant } from 'claude-pokemon-shared/moves'
import type { BattleParticipant, Lineage } from 'claude-pokemon-shared/types'

function firstMove(lineage: string, level: number): string {
  const m = movesForParticipant(lineage, level)[0]
  if (!m) throw new Error(`no moves for ${lineage}@${level}`)
  return m.name
}

/** A normal-type move (deals 0 to a ghost defender). */
function normalMove(lineage: string, level: number): string {
  const m = movesForParticipant(lineage, level).find(mv => mv.type === 'normal')
  if (!m) throw new Error(`no normal move for ${lineage}@${level}`)
  return m.name
}

/** A ghost-type move (deals 0 to a normal defender). */
function ghostMove(lineage: string, level: number): string {
  const m = movesForParticipant(lineage, level).find(mv => mv.type === 'ghost')
  if (!m) throw new Error(`no ghost move for ${lineage}@${level}`)
  return m.name
}

function side(
  anon_id: string,
  lineage: string,
  level: number,
  hp: number,
  action: string | null,
): LiveBattleSide {
  const snapshot: BattleParticipant = {
    anon_id,
    display_name: anon_id,
    lineage: lineage as Lineage,
    level,
    is_shiny: false,
  }
  return { anon_id, secret_hash: 'x'.repeat(64), snapshot, hp, pending_action: action }
}

function record(over: {
  challenger: LiveBattleSide
  defender: LiveBattleSide
  turn_no?: number
}): LiveBattleRecord {
  return {
    battle_id: 'deadbeef'.repeat(4),
    state: 'active',
    challenger: over.challenger,
    defender: over.defender,
    turn_no: over.turn_no ?? 1,
    turn_log: [],
    winner: null,
    reason: null,
    created_at: '2026-06-01T00:00:00Z',
    last_activity_at: '2026-06-01T00:00:00Z',
    forfeit_by: null,
  }
}

describe('resolveLiveTurn — KO end states', () => {
  it('challenger wins by KO when defender hits 0 HP', () => {
    const lvl = 50
    const c = side('aaaaaaaa', 'fire', lvl, maxHp(lvl, false), firstMove('fire', lvl))
    const d = side('bbbbbbbb', 'grass', 30, 1, firstMove('grass', 30)) // 1 HP → any strike KOs
    const r = record({ challenger: c, defender: d })

    resolveLiveTurn(r)

    expect(r.state).toBe('finished')
    expect(r.winner).toBe('challenger')
    expect(r.reason).toBe('ko')
    expect((r.defender as LiveBattleSide).hp).toBe(0)
    expect(r.challenger.hp).toBeGreaterThan(0)
    expect(r.turn_log.length).toBeGreaterThan(0)
    // pending actions cleared, turn advanced
    expect(r.challenger.pending_action).toBeNull()
    expect((r.defender as LiveBattleSide).pending_action).toBeNull()
    expect(r.turn_no).toBe(2)
  })

  it('defender wins by KO when challenger hits 0 HP', () => {
    const lvl = 50
    const c = side('aaaaaaaa', 'fire', lvl, 1, firstMove('fire', lvl)) // 1 HP → KO'd
    const d = side('bbbbbbbb', 'water', 50, maxHp(50, false), firstMove('water', 50))
    const r = record({ challenger: c, defender: d })

    resolveLiveTurn(r)

    expect(r.state).toBe('finished')
    expect(r.winner).toBe('defender')
    expect(r.reason).toBe('ko')
    expect(r.challenger.hp).toBe(0)
  })

  it('double-KO (both already at 0 HP) → draw / ko', () => {
    // Both start at 0: the strike loop skips both (attacker.hp <= 0 → continue),
    // so no strikes land and both remain 0 → the c.hp<=0 && d.hp<=0 branch.
    const c = side('aaaaaaaa', 'fire', 50, 0, firstMove('fire', 50))
    const d = side('bbbbbbbb', 'water', 50, 0, firstMove('water', 50))
    const r = record({ challenger: c, defender: d })

    resolveLiveTurn(r)

    expect(r.state).toBe('finished')
    expect(r.winner).toBe('draw')
    expect(r.reason).toBe('ko')
    expect(r.turn_log).toHaveLength(0) // no strikes landed
  })
})

describe('resolveLiveTurn — turn-limit tiebreak (HP %)', () => {
  // Low level keeps a single strike tiny; large HP gaps make the % comparison
  // robust against any damage roll without crossing into a KO.
  const lvl = 5
  const HP = maxHp(lvl, false)

  it('challenger wins the turn-limit when its HP% is higher', () => {
    const c = side('aaaaaaaa', 'fire', lvl, HP, firstMove('fire', lvl)) // full
    const d = side('bbbbbbbb', 'water', lvl, Math.round(HP * 0.4), firstMove('water', lvl)) // ~40%
    const r = record({ challenger: c, defender: d, turn_no: ARENA_MAX_TURNS })

    resolveLiveTurn(r)

    expect(r.state).toBe('finished')
    expect(r.reason).toBe('turn_limit')
    expect(r.winner).toBe('challenger')
    expect(r.turn_no).toBe(ARENA_MAX_TURNS + 1)
    expect(r.challenger.hp).toBeGreaterThan(0)
    expect((r.defender as LiveBattleSide).hp).toBeGreaterThan(0)
  })

  it('defender wins the turn-limit when its HP% is higher', () => {
    const c = side('aaaaaaaa', 'fire', lvl, Math.round(HP * 0.4), firstMove('fire', lvl)) // ~40%
    const d = side('bbbbbbbb', 'water', lvl, HP, firstMove('water', lvl)) // full
    const r = record({ challenger: c, defender: d, turn_no: ARENA_MAX_TURNS })

    resolveLiveTurn(r)

    expect(r.reason).toBe('turn_limit')
    expect(r.winner).toBe('defender')
  })

  it('equal HP% at the turn limit → draw (immune matchup keeps HP exact)', () => {
    // aipom (normal) Météores vs gastly (ghost) = 0 dmg; gastly (ghost) Ball'Ombre
    // vs aipom (normal) = 0 dmg. HP stays put, equal level+HP → cPct === dPct.
    const level = 30
    const hp = maxHp(level, false)
    const c = side('aaaaaaaa', 'aipom', level, hp, normalMove('aipom', level))
    const d = side('bbbbbbbb', 'gastly', level, hp, ghostMove('gastly', level))
    const r = record({ challenger: c, defender: d, turn_no: ARENA_MAX_TURNS })

    // Sanity: the immune matchup really deals 0 (no luck involved).
    resolveLiveTurn(r)

    expect(r.reason).toBe('turn_limit')
    expect(r.winner).toBe('draw')
    expect(r.challenger.hp).toBe(hp)
    expect((r.defender as LiveBattleSide).hp).toBe(hp)
    // Both struck (0-damage strikes still log a turn).
    expect(r.turn_log).toHaveLength(2)
    expect(r.turn_log.every(turnItem => turnItem.damage === 0)).toBe(true)
  })
})

describe('resolveLiveTurn — guards / no-ops', () => {
  it('does nothing when the battle is not active', () => {
    const c = side('aaaaaaaa', 'fire', 50, 100, firstMove('fire', 50))
    const d = side('bbbbbbbb', 'water', 50, 100, firstMove('water', 50))
    const r = record({ challenger: c, defender: d })
    r.state = 'pending'

    resolveLiveTurn(r)

    expect(r.state).toBe('pending')
    expect(r.turn_log).toHaveLength(0)
    expect(r.turn_no).toBe(1)
  })

  it('does nothing when one side has not committed an action', () => {
    const c = side('aaaaaaaa', 'fire', 50, 100, firstMove('fire', 50))
    const d = side('bbbbbbbb', 'water', 50, 100, null) // not committed
    const r = record({ challenger: c, defender: d })

    resolveLiveTurn(r)

    expect(r.turn_no).toBe(1)
    expect(r.winner).toBeNull()
  })

  it('returns without resolving when a committed move is not in the side pool', () => {
    const c = side('aaaaaaaa', 'fire', 50, 100, 'NotARealMove')
    const d = side('bbbbbbbb', 'water', 50, 100, firstMove('water', 50))
    const r = record({ challenger: c, defender: d })

    resolveLiveTurn(r)

    expect(r.turn_log).toHaveLength(0)
    expect(r.turn_no).toBe(1)
    expect(r.state).toBe('active')
  })

  it('does nothing pre-accept (defender has no snapshot)', () => {
    const c = side('aaaaaaaa', 'fire', 50, 100, firstMove('fire', 50))
    const r = record({
      challenger: c,
      defender: c, // placeholder, overwritten below
    })
    ;(r as LiveBattleRecord).defender = { anon_id: 'bbbbbbbb' }

    resolveLiveTurn(r)

    expect(r.turn_no).toBe(1)
    expect(r.turn_log).toHaveLength(0)
  })
})

describe('lookupMoveForSide', () => {
  it('finds a move that exists in the side pool', () => {
    const c = side('aaaaaaaa', 'fire', 50, 100, null)
    const m = lookupMoveForSide(c, firstMove('fire', 50))
    expect(m).not.toBeNull()
    expect(m?.name).toBe(firstMove('fire', 50))
  })

  it('returns null for a move not in the pool', () => {
    const c = side('aaaaaaaa', 'fire', 50, 100, null)
    expect(lookupMoveForSide(c, 'NopeMove')).toBeNull()
  })
})
