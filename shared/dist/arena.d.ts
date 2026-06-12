import { type Locale } from './render/i18n.js';
type Json = any;
export declare function buildTeam(state: Json, anonId: string, displayName: string): Json | null;
export declare function renderBattle(locale: Locale, raw: Json): string;
export interface ArenaInput {
    args: string[];
    data: Json;
    state: Json;
    locale: Locale;
    /** Current arena_secret file contents ('' if none). */
    arenaSecret: string;
    now: string;
}
export type SecretOp = {
    action: 'save';
    value: string;
} | {
    action: 'clear';
} | null;
export interface ArenaOutput {
    data: Json;
    output: string;
    dataChanged: boolean;
    secret: SecretOp;
    state: Json;
    stateChanged: boolean;
}
export declare function applyTrainerToState(state: Json, trainer: Json, now: string): Json;
/** Returns null for live/pair/link/unknown → bash dispatcher falls back. */
export declare function runArena(input: ArenaInput): Promise<ArenaOutput | null>;
export {};
//# sourceMappingURL=arena.d.ts.map