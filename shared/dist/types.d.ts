export type Lineage = 'fire' | 'water' | 'grass' | 'electric' | 'eevee' | 'chikorita' | 'cyndaquil' | 'totodile';
/** Pokémon types used by the battle engine. We collapse the 18 canonical
 * types to 5 (the lineages we actually have) — fewer matchups to balance,
 * tighter rock-paper-scissors loop. */
export type CombatType = 'fire' | 'water' | 'grass' | 'electric' | 'normal';
export type BattleSide = 'challenger' | 'defender';
export declare const ALLOWED_LINEAGES: ReadonlySet<string>;
/** Lineage → effective combat type. Cross-gen lineages share their Gen-1
 * counterpart's type ; eevee defaults to 'normal' (its evolutions could
 * type-specialize later but the MVP keeps it flat). */
export declare const LINEAGE_TO_TYPE: Record<Lineage, CombatType>;
/** Hard cap on the number of turn ticks before a battle is declared a
 * turn_limit result. Both sides take ~25 attacks each at full pace, which
 * is enough for any non-pathological matchup to KO. */
export declare const ARENA_MAX_TURNS = 50;
export interface BattleParticipant {
    anon_id: string;
    display_name: string | null;
    lineage: Lineage;
    level: number;
    is_shiny: boolean;
}
export interface BattleTurn {
    /** 1-indexed turn counter (each strike = one turn). */
    turn: number;
    /** Side that attacked this turn. */
    actor: BattleSide;
    damage: number;
    /** TYPE_CHART multiplier (0.5 / 1 / 2). */
    effectiveness: number;
    critical: boolean;
    /** HP of the side that just got hit, after this strike. */
    defender_hp_after: number;
}
export interface BattleResult {
    /** Assigned by the persistence layer ; null if the battle is in-memory. */
    battle_id: string | null;
    challenger: BattleParticipant;
    defender: BattleParticipant;
    seed: number;
    turns: BattleTurn[];
    winner: BattleSide | 'draw';
    reason: 'ko' | 'turn_limit';
    created_at: string;
}
//# sourceMappingURL=types.d.ts.map