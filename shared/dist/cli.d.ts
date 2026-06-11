export interface DeriveInput {
    thresholds: number[];
    total_xp: number;
    /** Optional override; defaults to levelFromXp(thresholds, total_xp). */
    level?: number | null;
    lineage: string;
    /** % of context window in use; null → neutral multipliers. */
    used_pct?: number | null;
}
export interface DeriveOutput {
    level: number;
    threshold: number;
    xp_to_next: number;
    progress_pct: number;
    /** Fixed 1-decimal string, e.g. "2.0". */
    xp_multiplier: string;
    /** Fixed 1-decimal string, e.g. "1.2". */
    type_match_mult: string;
}
export declare function derive(input: DeriveInput): DeriveOutput;
//# sourceMappingURL=cli.d.ts.map