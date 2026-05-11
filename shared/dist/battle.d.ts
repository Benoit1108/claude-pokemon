import { type BattleParticipant, type BattleResult, type BattleSide, type BattleTurn, type CombatType } from './types.js';
export declare const TYPE_CHART: Record<CombatType, Record<CombatType, number>>;
export declare function maxHp(level: number, isShiny: boolean): number;
export declare function attackPower(level: number, isShiny: boolean): number;
export declare function mulberry32(seed: number): () => number;
export declare function hashSeed(input: string): number;
/**
 * Resolve a battle deterministically.
 *
 * Turn order : higher level first; tie broken by a single rng() coin flip.
 * Battle ends when a side reaches 0 HP, or after ARENA_MAX_TURNS — in which
 * case the higher HP% wins (draw if equal).
 */
export declare function resolveBattle(args: {
    challenger: BattleParticipant;
    defender: BattleParticipant;
    seed: number;
    createdAt: string;
}): BattleResult;
/**
 * Derive a side's current HP at the end of a turn slice.
 *
 * The BattleTurn shape carries `defender_hp_after` (the HP of the SIDE BEING
 * HIT after that turn). To reconstruct HP for either combatant during replay
 * we walk the turns and snapshot the last value where that side was hit.
 *
 *   - actor === 'challenger' → defender side took damage → that turn updates
 *     the DEFENDER's HP.
 *   - actor === 'defender' → challenger side took damage → that turn updates
 *     the CHALLENGER's HP.
 *
 * Returns max when no turns provided (battle just started).
 */
export declare function deriveHpFromTurns(side: BattleSide, turns: BattleTurn[] | undefined, max: number): number;
//# sourceMappingURL=battle.d.ts.map