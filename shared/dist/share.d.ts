import { type Locale } from './render/i18n.js';
type Json = any;
export interface ShareInput {
    args: string[];
    data: Json;
    locale: Locale;
    /** anon_id for `enable --confirm` (engine generates via crypto). */
    anonId: string;
}
export interface ShareOutput {
    data: Json;
    output: string;
    changed: boolean;
}
export declare function buildSubmitPayload(data: Json, state: Json, anonId: string, clientVer: string, displayName: string, now: string): Json;
export declare function renderForget(data: Json, locale: Locale, anonId: string, ok: boolean): ShareOutput;
export declare function renderSubmit(state: Json, locale: Locale, enabled: boolean, code: number, cooldownS: number, now: string): {
    state: Json;
    output: string;
    changed: boolean;
};
/** Returns null for subcommands the engine doesn't own (forget/submit/unknown)
 *  → the bash dispatcher falls back. */
export declare function runShare(input: ShareInput): ShareOutput | null;
export {};
//# sourceMappingURL=share.d.ts.map