import { describe, it, expect } from 'vitest'
import {
  computeXpReward,
  levelFromTotalXp,
  totalXpForLevel,
  xpForLevel,
} from '../../src/data/zone-xp'

describe('zone XP curve', () => {
  it('xpForLevel monotonically increases', () => {
    let prev = -1
    for (let lv = 1; lv <= 99; lv++) {
      const x = xpForLevel(lv)
      expect(x).toBeGreaterThan(prev)
      prev = x
    }
  })

  it('Lv.100 caps (xpForLevel(100) = Infinity)', () => {
    expect(xpForLevel(100)).toBe(Infinity)
  })

  it('round-trip : levelFromTotalXp(totalXpForLevel(N)) = (N, 0)', () => {
    for (const lv of [1, 2, 5, 10, 25, 50, 99]) {
      const total = totalXpForLevel(lv)
      const { level, currentXp } = levelFromTotalXp(total)
      expect(level).toBe(lv)
      expect(currentXp).toBe(0)
    }
  })

  it('partial XP between thresholds reports correct (level, currentXp)', () => {
    // Total = enough for Lv.5 + half of the Lv.5→6 cost
    const lv5Total = totalXpForLevel(5)
    const lv5to6Cost = xpForLevel(5)
    const total = lv5Total + Math.floor(lv5to6Cost / 2)
    const { level, currentXp } = levelFromTotalXp(total)
    expect(level).toBe(5)
    expect(currentXp).toBeCloseTo(Math.floor(lv5to6Cost / 2), 0)
  })

  it('caps at Lv.100', () => {
    const { level } = levelFromTotalXp(10_000_000)
    expect(level).toBe(100)
  })
})

describe('computeXpReward', () => {
  it('base = wild_level × 50 at neutral effectiveness on common pool', () => {
    const r = computeXpReward(10, 1, 'common')
    expect(r.breakdown.base).toBe(500)
    expect(r.amount).toBe(500)
  })

  it('super-effective ×1.5', () => {
    const r = computeXpReward(10, 2, 'common')
    expect(r.breakdown.effectiveness_modifier).toBe(1.5)
    expect(r.amount).toBe(750)
  })

  it('not very effective ×0.7', () => {
    const r = computeXpReward(10, 0.5, 'common')
    expect(r.breakdown.effectiveness_modifier).toBe(0.7)
    expect(r.amount).toBe(350)
  })

  it('legendary pool ×3', () => {
    const r = computeXpReward(50, 1, 'legendary')
    expect(r.breakdown.pool_modifier).toBe(3)
    expect(r.amount).toBe(7500) // 50 × 50 × 1 × 3
  })

  it('rare pool ×1.5', () => {
    const r = computeXpReward(20, 1, 'rare')
    expect(r.breakdown.pool_modifier).toBe(1.5)
    expect(r.amount).toBe(1500)
  })

  it('stacks all modifiers : super-effective × legendary', () => {
    const r = computeXpReward(70, 2, 'legendary')
    // 70 × 50 = 3500 × 1.5 × 3 = 15750
    expect(r.amount).toBe(15750)
  })
})
