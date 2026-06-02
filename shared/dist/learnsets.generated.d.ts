import type { CombatType } from './types.js';
export interface GeneratedMove {
    name: string;
    type: CombatType;
    power: number;
}
/** Offensive moves catalog, keyed by PokéAPI move id. */
export declare const GENERATED_MOVES: Record<string, GeneratedMove>;
/** Level-up offensive learnset per species (wild_pool id), sorted by level. */
export declare const SPECIES_LEARNSET: Record<string, {
    move: string;
    level: number;
}[]>;
//# sourceMappingURL=learnsets.generated.d.ts.map