import { type Locale } from './i18n.js';
type Json = any;
export type NetResult = {
    endpoint: false;
} | {
    fetchFailed: true;
} | {
    resp: Json;
};
export declare function renderLeaderboard(data: Json, locale: Locale, metric: string, result: NetResult): string;
export declare function renderAggregate(_data: Json, locale: Locale, result: NetResult): string;
export {};
//# sourceMappingURL=net.d.ts.map