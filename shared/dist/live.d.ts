import { type Locale } from './render/i18n.js';
type Json = any;
export declare function liveStageFor(lin: string, lvl: number): string;
export declare function renderLiveStatus(resp: Json, me: string): string;
export interface LiveInput {
    args: string[];
    data: Json;
    locale: Locale;
    secret: string;
}
export interface LiveOutput {
    data: Json;
    output: string;
    dataChanged: boolean;
}
export declare function runLive(input: LiveInput): Promise<LiveOutput>;
export {};
//# sourceMappingURL=live.d.ts.map