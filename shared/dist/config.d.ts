import { type Locale } from './render/i18n.js';
type Json = any;
export interface ConfigInput {
    cmd: 'quote' | 'bio' | 'pins';
    args: string[];
    data: Json;
    state: Json;
    locale: Locale;
}
export interface ConfigOutput {
    data: Json;
    output: string;
    /** True only when data was mutated — bash rewrites data.json only then (show
     *  actions must not reformat the file). */
    changed: boolean;
}
export declare function runConfig(input: ConfigInput): ConfigOutput;
export {};
//# sourceMappingURL=config.d.ts.map