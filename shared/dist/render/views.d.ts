import { type Locale } from './i18n.js';
type Json = any;
export interface RenderContext {
    state: Json;
    data: Json;
    locale: Locale;
    /** Active UI language; read by the pokedex slice (data.wild_pool name_<lang>). */
    lang: string;
    /** Script basename used in the team pc-overflow line (bash used its $0). */
    scriptName: string;
    /** Unix epoch seconds for the recap session/today duration (bash used `date`).
     *  Optional: the deterministic recap path (no active session) never reads it. */
    nowEpoch?: number;
}
export declare function renderBadges(ctx: RenderContext): string;
export declare function renderInventory(ctx: RenderContext): string;
export declare function renderTeam(ctx: RenderContext): string;
export declare function renderPc(ctx: RenderContext): string;
export declare function renderMain(ctx: RenderContext): string;
export declare function renderRecap(ctx: RenderContext, scope?: string): string;
export declare function renderTrainerCard(ctx: RenderContext): string;
export declare function renderStats(ctx: RenderContext): string;
export declare function renderPokedex(ctx: RenderContext): string;
export {};
//# sourceMappingURL=views.d.ts.map