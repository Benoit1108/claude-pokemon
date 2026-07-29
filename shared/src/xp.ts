// XP curve — pure functions over the threshold table.
//
// `thresholds[level]` = cumulative XP required to BE at that level (thresholds[0] = 0).
// Ported from the bash engine (lib/lib.sh: pokemon_threshold,
// pokemon_compute_level_from_xp, pokemon_xp_to_next, pokemon_progress_pct) as the
// first slice of the engine port (Phase R1b, ADR-006). Verified line-for-line
// against the R0 golden fixtures by tests/golden-parity.test.ts.
//
// Pure by contract: the table is passed in (no IO, no global data) so CLI, worker
// and web get identical results. Relocating the table into shared is deferred.

/** thresholds[level] — cumulative XP to reach `level`. */
export function thresholdFor(thresholds: number[], level: number): number {
  return thresholds[level]!
}

/** Highest level whose cumulative threshold is ≤ totalXp. */
export function levelFromXp(thresholds: number[], totalXp: number): number {
  let count = 0
  for (const t of thresholds) if (t <= totalXp) count++
  return count - 1
}

/** Remaining XP to the next level; 0 at the cap. */
export function xpToNext(thresholds: number[], totalXp: number, level: number): number {
  const maxLevel = thresholds.length - 1
  if (level >= maxLevel) return 0
  return thresholds[level + 1]! - totalXp
}

/** Integer percentage of the way through `level` (floored, clamped 0–100; 100 at cap). */
export function progressPct(thresholds: number[], totalXp: number, level: number): number {
  const maxLevel = thresholds.length - 1
  if (level >= maxLevel) return 100
  const cur = thresholds[level]!
  const nxt = thresholds[level + 1]!
  const pct = Math.floor(((totalXp - cur) * 100) / (nxt - cur))
  if (pct < 0) return 0
  if (pct > 100) return 100
  return pct
}

// ── Context-based XP multipliers (ported from lib/lib.sh) ────────────────────

/**
 * Context-usage XP multiplier (pokemon_xp_multiplier). `usedPct` = % of the
 * model context window in use; null/undefined → neutral 1.0.
 *   ≤25 → 2.0 · ≤50 → 1.5 · ≤75 → 1.0 · else → 0.5
 */
export function xpMultiplier(usedPct: number | null | undefined): number {
  if (usedPct == null) return 1.0
  const p = Math.round(usedPct)
  if (p <= 25) return 2.0
  if (p <= 50) return 1.5
  if (p <= 75) return 1.0
  return 0.5
}

/**
 * Lineage-specific context bonus (pokemon_type_match_mult). Each starter family
 * has a context sweet-spot; everything else is neutral.
 *   fire: <30 → 1.2 · water: >70 → 1.2 · grass: 40–60 → 1.2
 *   electric: 1.2 always · eevee: 1.1 always · gastly: ≥80 → 1.2 · other: 1.0
 *
 * The Gastly line haunts a saturated context — the trade-off being that it is
 * the only family with no bonus anywhere in the normal working band. It shares
 * the high end with water (>70), and the ≥80 window sits inside the range where
 * the context multiplier is already penalising, so the two partly cancel.
 */
export function typeMatchMultiplier(lineage: string, usedPct: number): number {
  const p = Math.round(usedPct)
  switch (lineage) {
    case 'fire':
      return p < 30 ? 1.2 : 1.0
    case 'water':
      return p > 70 ? 1.2 : 1.0
    case 'grass':
      return p >= 40 && p <= 60 ? 1.2 : 1.0
    case 'electric':
      return 1.2
    case 'eevee':
      return 1.1
    case 'gastly':
      return p >= 80 ? 1.2 : 1.0
    default:
      return 1.0
  }
}
