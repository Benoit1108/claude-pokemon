import { type Locale } from './render/i18n.js';
type Json = any;
export interface CommandInput {
    name: string;
    args: string[];
    state: Json;
    data: Json;
    locale: Locale;
    now: string;
    /** Epoch seconds — for cooldown checks (game / trade). */
    nowEpoch?: number;
    /** Injected randomness (game / trade), like the tick. */
    decisions?: {
        pool_idx?: number;
        trade_level?: number;
        trade_shiny?: boolean;
    };
}
export interface CommandResult {
    output: string;
    state: Json;
    stateChanged: boolean;
}
export declare function runCommand(input: CommandInput): CommandResult | null;
export {};
//# sourceMappingURL=commands.d.ts.map