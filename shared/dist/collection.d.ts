type Json = any;
export declare function activeToArchive(state: Json, now: string): Json;
export declare function resetActive(state: Json, now: string, forcedLineage?: string | null): Json;
export declare function archiveToTeam(state: Json, now: string): Json;
export declare function loadTeamToActive(state: Json, now: string, idx: number): Json;
export declare function teamToPc(state: Json, idx: number): Json;
export declare function pcToTeamOrActive(state: Json, now: string, idx: number): Json | null;
export declare function releaseSlot(state: Json, area: string, idx: number): Json;
export declare function checkBadges(state: Json, now: string, data: Json): Json;
export declare function switchCompanion(state: Json, now: string, slot: number): Json;
export declare function hatch(state: Json, now: string, data: Json, forcedLineage?: string | null): Json;
export declare function ceremonialReset(state: Json, now: string, data: Json): Json;
export {};
//# sourceMappingURL=collection.d.ts.map