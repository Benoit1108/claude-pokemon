type Json = any;
export declare function themeAccent(theme: string): string;
export declare function ansiColor(theme: string, name: string): string;
export declare function rainbowName(name: string): string;
export declare function trimSprite(content: string): string[];
export declare function renderInline(state: Json, data: Json): string;
export interface SpriteDeps {
    /** Read POKEMON_DIR/<relPath>; null if missing. */
    readSprite: (relPath: string) => string | null;
    /** Count frame_*.txt in POKEMON_DIR/<relDir>; 0 if the dir is absent. */
    animFrameCount: (relDir: string) => number;
}
export declare function renderSpriteLines(state: Json, data: Json, deps: SpriteDeps): string[];
export interface StatuslineCtx {
    state: Json;
    data: Json;
    /** Claude's context_window.used_percentage as a string, or '' if absent. */
    used: string;
    project: string;
    branch: string;
    model: string;
    effort: string;
}
export declare function renderStatusline(ctx: StatuslineCtx, deps: SpriteDeps): string;
export {};
//# sourceMappingURL=statusline.d.ts.map