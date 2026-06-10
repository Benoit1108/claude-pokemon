/** thresholds[level] — cumulative XP to reach `level`. */
export declare function thresholdFor(thresholds: number[], level: number): number;
/** Highest level whose cumulative threshold is ≤ totalXp. */
export declare function levelFromXp(thresholds: number[], totalXp: number): number;
/** Remaining XP to the next level; 0 at the cap. */
export declare function xpToNext(thresholds: number[], totalXp: number, level: number): number;
/** Integer percentage of the way through `level` (floored, clamped 0–100; 100 at cap). */
export declare function progressPct(thresholds: number[], totalXp: number, level: number): number;
/**
 * Context-usage XP multiplier (pokemon_xp_multiplier). `usedPct` = % of the
 * model context window in use; null/undefined → neutral 1.0.
 *   ≤25 → 2.0 · ≤50 → 1.5 · ≤75 → 1.0 · else → 0.5
 */
export declare function xpMultiplier(usedPct: number | null | undefined): number;
/**
 * Lineage-specific context bonus (pokemon_type_match_mult). Each starter family
 * has a context sweet-spot; everything else is neutral.
 *   fire: <30 → 1.2 · water: >70 → 1.2 · grass: 40–60 → 1.2
 *   electric: 1.2 always · eevee: 1.1 always · other: 1.0
 */
export declare function typeMatchMultiplier(lineage: string, usedPct: number): number;
//# sourceMappingURL=xp.d.ts.map