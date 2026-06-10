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
 * to vaporeon. Pass `eeveeForm` (the chosen evolution, mirrors state.eevee_form
 * in the CLI) to override — it selects that form once the level qualifies.
 */
export declare function stageFor(lineage: string, level: number, eeveeForm?: string | null): LineageStage;
//# sourceMappingURL=stages.d.ts.map