type Json = any;
export interface TickDecisions {
    /** Lineage to assign when the active has none (bash pokemon_pick_starter). */
    starter?: string | null;
    /** Shiny roll outcome — applied only on the 0→1 hatch. */
    shiny: boolean;
    /** Index 0-2 into [fire_stone, water_stone, thunder_stone] for the low-
     *  friendship Eevee fallback. */
    eevee_fallback_index: number;
    berry: {
        fired: boolean;
        index: number;
    };
    encounter: {
        fired: boolean;
        index: number;
    };
    battle: {
        fired: boolean;
        wild_level: number;
        bonus_xp_raw: number;
    };
    item: {
        fired: boolean;
        index: number;
    };
}
export interface TickInput {
    state: Json;
    data: Json;
    now: string;
    now_epoch: number;
    session_id: string;
    current_tokens: number;
    used_pct?: number | null;
    decisions: TickDecisions;
}
export declare function tick(input: TickInput): {
    state: Json;
};
export {};
//# sourceMappingURL=tick.d.ts.map