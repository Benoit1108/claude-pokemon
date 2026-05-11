import type { Lineage } from './types.js';
export interface LineageStage {
    /** Inclusive lower bound : the player is at this stage iff level ≥ this. */
    min_level: number;
    /** Matches Pokémon Showdown's sprite path component. */
    showdown_id: string;
}
export declare const LINEAGE_STAGES: Record<Lineage, LineageStage[]>;
/**
 * Find the highest stage qualifying for the given level.
 *
 * On ties (multiple stages share the same min_level — Eevee at Lv.30 has 5
 * forms), the first one listed wins. So `stageFor('eevee', 30)` defaults
 * to vaporeon. Use the eevee_form field (when added) to override.
 */
export declare function stageFor(lineage: string, level: number): LineageStage;
//# sourceMappingURL=stages.d.ts.map