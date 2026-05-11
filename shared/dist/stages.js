// Lineage stages — level threshold → showdown_id mapping. Used by :
//   - the moves catalog (movesForStage takes a showdown_id)
//   - the web sprite resolver (URL = Showdown CDN keyed on showdown_id)
//   - any future "what evolution am I at" lookup
//
// Stage names (Salamèche / Reptincel / ...) live in the web because they're
// FR-localized presentation — not needed by the worker engine.
// Mirror of lib/data/lineages/gen{N}.json on the CLI side. When the CLI ships
// a new stage, sync this map.
//
// Eevee evolves into ONE of 5 forms at Lv.30. The submit payload doesn't yet
// carry the chosen form, so we default to vaporeon (first listed at min=30).
// TODO: extend the schema with eevee_form so we render the actual evolution.
export const LINEAGE_STAGES = {
    fire: [
        { min_level: 0, showdown_id: 'egg' },
        { min_level: 1, showdown_id: 'charmander' },
        { min_level: 16, showdown_id: 'charmeleon' },
        { min_level: 36, showdown_id: 'charizard' },
        { min_level: 55, showdown_id: 'charizard-megax' },
        { min_level: 100, showdown_id: 'charizard-megay' },
    ],
    water: [
        { min_level: 0, showdown_id: 'egg' },
        { min_level: 1, showdown_id: 'squirtle' },
        { min_level: 16, showdown_id: 'wartortle' },
        { min_level: 36, showdown_id: 'blastoise' },
        { min_level: 55, showdown_id: 'blastoise-mega' },
        { min_level: 100, showdown_id: 'blastoise-gmax' },
    ],
    grass: [
        { min_level: 0, showdown_id: 'egg' },
        { min_level: 1, showdown_id: 'bulbasaur' },
        { min_level: 16, showdown_id: 'ivysaur' },
        { min_level: 32, showdown_id: 'venusaur' },
        { min_level: 55, showdown_id: 'venusaur-mega' },
        { min_level: 100, showdown_id: 'venusaur-gmax' },
    ],
    electric: [
        { min_level: 0, showdown_id: 'egg' },
        { min_level: 1, showdown_id: 'pichu' },
        { min_level: 10, showdown_id: 'pikachu' },
        { min_level: 30, showdown_id: 'raichu' },
        { min_level: 55, showdown_id: 'raichu-alola' },
        { min_level: 100, showdown_id: 'pikachu-gmax' },
    ],
    eevee: [
        { min_level: 0, showdown_id: 'egg' },
        { min_level: 1, showdown_id: 'eevee' },
        { min_level: 30, showdown_id: 'vaporeon' },
        { min_level: 30, showdown_id: 'jolteon' },
        { min_level: 30, showdown_id: 'flareon' },
        { min_level: 30, showdown_id: 'espeon' },
        { min_level: 30, showdown_id: 'umbreon' },
    ],
    chikorita: [
        { min_level: 0, showdown_id: 'egg' },
        { min_level: 1, showdown_id: 'chikorita' },
        { min_level: 16, showdown_id: 'bayleef' },
        { min_level: 32, showdown_id: 'meganium' },
    ],
    cyndaquil: [
        { min_level: 0, showdown_id: 'egg' },
        { min_level: 1, showdown_id: 'cyndaquil' },
        { min_level: 16, showdown_id: 'quilava' },
        { min_level: 32, showdown_id: 'typhlosion' },
        { min_level: 55, showdown_id: 'typhlosion-hisui' },
    ],
    totodile: [
        { min_level: 0, showdown_id: 'egg' },
        { min_level: 1, showdown_id: 'totodile' },
        { min_level: 16, showdown_id: 'croconaw' },
        { min_level: 32, showdown_id: 'feraligatr' },
    ],
};
/**
 * Find the highest stage qualifying for the given level.
 *
 * On ties (multiple stages share the same min_level — Eevee at Lv.30 has 5
 * forms), the first one listed wins. So `stageFor('eevee', 30)` defaults
 * to vaporeon. Use the eevee_form field (when added) to override.
 */
export function stageFor(lineage, level) {
    const stages = LINEAGE_STAGES[lineage] ?? LINEAGE_STAGES.fire;
    let chosen = stages[0];
    for (const s of stages) {
        if (s.min_level > level)
            break; // stages are sorted by min_level ascending
        if (s.min_level > chosen.min_level)
            chosen = s; // strictly greater = new tier
    }
    return chosen;
}
//# sourceMappingURL=stages.js.map