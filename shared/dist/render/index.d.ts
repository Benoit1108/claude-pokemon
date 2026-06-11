import type { Locale } from './i18n.js';
export interface RenderInput {
    view: string;
    state: any;
    data: any;
    locale: Locale;
    lang?: string;
    scriptName?: string;
    /** recap scope (session|today|…) and clock for the duration line. */
    scope?: string;
    nowEpoch?: number;
    /** Pre-rendered sprite lines for the main view. */
    sprite?: string[] | null;
}
export declare const SUPPORTED_VIEWS: string[];
export declare function renderView(input: RenderInput): {
    supported: boolean;
    output: string;
};
//# sourceMappingURL=index.d.ts.map