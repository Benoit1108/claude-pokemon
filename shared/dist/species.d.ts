import { type CombatType } from './types.js';
import { SPECIES_COMBAT_TYPE } from './species-combat-type.generated.js';
export { SPECIES_COMBAT_TYPE };
/** A species' effective combat type (e.g. `psyduck` → `water`). Unknown
 * species default to 'normal'. */
export declare function speciesToCombatType(speciesId: string): CombatType;
/** Resolve a combatant's type from its `lineage` field. Starter lineages keep
 * their curated mapping ; everything else is treated as a species id (with an
 * optional `trade-` prefix stripped) and resolved from the wild-pool data. */
export declare function lineageToCombatType(lineage: string | null | undefined): CombatType;
//# sourceMappingURL=species.d.ts.map