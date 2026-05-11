// Web-native XP curve (Sprint 4.6). Used by /v1/zone/<id>/fight to translate
// "wild Pokémon defeated" → "trainer levelled up".
//
// Design choice : the CLI's threshold curve is calibrated for token-based
// XP from real dev activity (300K tokens for Lv.1 → 300M for Lv.100). Zone
// XP can't reuse that curve — clicking explore could never earn 300K XP/h.
//
// We define a separate, gameplay-friendly curve here :
//   threshold(level) = round(50 * level^1.5)
// Plays out as :
//   Lv.1→2  :    50 XP  (~2 wild fights at Lv.5)
//   Lv.5→6  :   559 XP  (~12 fights vs Lv.10 wilds)
//   Lv.10→11:  1581 XP  (~25 fights vs Lv.15 wilds)
//   Lv.50→51: 17677 XP  (~50 fights vs Lv.50 wilds, ~17 min play time at
//                         the 20s cooldown)
//   Lv.100   : 50000 XP per level
//
// XP awarded per win (server-side, can't be inflated by client) :
//   base = wild.level × 50
//   × 1.5 if super-effective
//   × 0.7 if not very effective
//   × 1.5 for rare-pool species
//   × 3   for legendary-pool species
// Defeat = 0 XP (no participation trophy).

import type { PendingEncounter } from '../types'

/** Compute the XP needed to advance from `level` → `level + 1`. */
export function xpForLevel(level: number): number {
  if (level < 1) return 0
  if (level >= 100) return Infinity // Lv.100 is the cap
  return Math.round(50 * Math.pow(level, 1.5))
}

/** Convert a cumulative zone-XP total into a (level, currentXp) tuple
 * where `currentXp` is the XP earned toward the NEXT level (0 if at
 * cap). Caps at Lv.100. */
export function levelFromTotalXp(totalXp: number): { level: number; currentXp: number } {
  let level = 1
  let remaining = totalXp
  while (level < 100) {
    const cost = xpForLevel(level)
    if (remaining < cost) break
    remaining -= cost
    level += 1
  }
  return { level, currentXp: remaining }
}

/** Inverse helper for tests / display : total XP that puts you at the
 * given level with 0 progress toward the next one. */
export function totalXpForLevel(level: number): number {
  let total = 0
  for (let l = 1; l < level; l++) total += xpForLevel(l)
  return total
}

export interface XpReward {
  /** Raw XP earned (already factored in all modifiers). */
  amount: number
  /** Detailed breakdown for the UI : "12 base × 1.5 super-effective × 3 legendary". */
  breakdown: {
    base: number
    effectiveness_modifier: number
    pool_modifier: number
  }
}

const POOL_MULTIPLIER: Record<PendingEncounter['pool'], number> = {
  common: 1,
  rare: 1.5,
  legendary: 3,
}

/** XP awarded for defeating a wild encounter.
 *
 * @param wildLevel level of the wild Pokémon
 * @param effectiveness final hit's TYPE_CHART multiplier (0.5 / 1 / 2)
 * @param pool which pool the species came from
 */
export function computeXpReward(
  wildLevel: number,
  effectiveness: number,
  pool: PendingEncounter['pool'],
): XpReward {
  const base = wildLevel * 50
  const effMod = effectiveness >= 2 ? 1.5 : effectiveness <= 0.5 ? 0.7 : 1
  const poolMod = POOL_MULTIPLIER[pool] ?? 1
  return {
    amount: Math.round(base * effMod * poolMod),
    breakdown: {
      base,
      effectiveness_modifier: effMod,
      pool_modifier: poolMod,
    },
  }
}
