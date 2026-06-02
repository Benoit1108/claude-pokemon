// Species & lineage → combat type resolution.
//
// The arena accepts ANY companion raised in the CLI — not just the 8 starter
// lineages. A lineage string can be a starter key (`fire`, `water`, …,
// `chikorita`), a traded species (`trade-psyduck`), or a bare species id
// (`psyduck`, e.g. hand-edited state). All of them resolve here ; anything
// unknown falls back to 'normal' so a new species can never block a battle.
import { LINEAGE_TO_TYPE } from './types.js';
import { SPECIES_COMBAT_TYPE } from './species-combat-type.generated.js';
export { SPECIES_COMBAT_TYPE };
/** A species' effective combat type (e.g. `psyduck` → `water`). Unknown
 * species default to 'normal'. */
export function speciesToCombatType(speciesId) {
    return SPECIES_COMBAT_TYPE[speciesId] ?? 'normal';
}
/** Resolve a combatant's type from its `lineage` field. Starter lineages keep
 * their curated mapping ; everything else is treated as a species id (with an
 * optional `trade-` prefix stripped) and resolved from the wild-pool data. */
export function lineageToCombatType(lineage) {
    if (!lineage)
        return 'normal';
    if (lineage in LINEAGE_TO_TYPE)
        return LINEAGE_TO_TYPE[lineage];
    const speciesId = lineage.replace(/^trade-/, '');
    return speciesToCombatType(speciesId);
}
//# sourceMappingURL=species.js.map