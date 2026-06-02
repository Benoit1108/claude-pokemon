import type { CombatType } from './types.js';
export interface Move {
    name: string;
    type: CombatType;
    power: number;
}
export declare const MOVES: Record<string, Move>;
/** 4 moves per evolution stage. Picked to give type variety + a balance of
 * signature and utility moves. Stages without explicit entries fall back
 * to BASIC_MOVES via movesForStage. */
export declare const STAGE_MOVES: Record<string, string[]>;
/** The four moves available at a given stage. Falls back to a basic set when
 * the stage isn't catalogued so battles never get stuck without options. */
export declare function movesForStage(showdownId: string): Move[];
/** Convenience wrapper : (lineage, level) → 4 moves available at that tier.
 * Starter lineages keep their hand-curated stage movesets ; any other lineage
 * (wild / traded species) resolves its moveset from the level-up learnset. */
export declare function movesForParticipant(lineage: string, level: number): Move[];
//# sourceMappingURL=moves.d.ts.map