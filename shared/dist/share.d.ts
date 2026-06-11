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
/** Returns null for subcommands the engine doesn't own (forget/submit/unknown)
 *  → the bash dispatcher falls back. */
export declare function runShare(input: ShareInput): ShareOutput | null;
export {};
//# sourceMappingURL=share.d.ts.map