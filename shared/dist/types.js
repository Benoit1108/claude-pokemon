// Shared battle types — single source of truth for the claude-pokemon
// ecosystem. The worker API, the arena web, and any future client must
// import these instead of re-declaring them.
/** The 18 canonical Pokémon types. The battle engine used to collapse these
 * to 5 (the starter lineages) — since "wild & traded Pokémon in the arena"
 * (Phase 2.14) every species keeps its real type (a Dragon stays a Dragon),
 * resolved from its `wild_pool` entry. Combatants remain single-type (the
 * CLI data stores one type per species). */
export const COMBAT_TYPES = [
    'normal',
    'fire',
    'water',
    'electric',
    'grass',
    'ice',
    'fighting',
    'poison',
    'ground',
    'flying',
    'psychic',
    'bug',
    'rock',
    'ghost',
    'dragon',
    'dark',
    'steel',
    'fairy',
];
// Typed as ReadonlySet<string> (not Lineage) so validation code can pass
// arbitrary user input through .has() without a cast. The .has() result is
// always boolean — TS predicate refinement would be nicer but isn't worth
// pushing the cast onto every caller.
export const ALLOWED_LINEAGES = new Set([
    'fire',
    'water',
    'grass',
    'electric',
    'eevee',
    'chikorita',
    'cyndaquil',
    'totodile',
]);
/** Lineage → effective combat type. Cross-gen lineages share their Gen-1
 * counterpart's type ; eevee defaults to 'normal' (its evolutions could
 * type-specialize later but the MVP keeps it flat). */
export const LINEAGE_TO_TYPE = {
    fire: 'fire',
    cyndaquil: 'fire',
    water: 'water',
    totodile: 'water',
    grass: 'grass',
    chikorita: 'grass',
    electric: 'electric',
    eevee: 'normal',
};
/** Hard cap on the number of turn ticks before a battle is declared a
 * turn_limit result. Both sides take ~25 attacks each at full pace, which
 * is enough for any non-pathological matchup to KO. */
export const ARENA_MAX_TURNS = 50;
//# sourceMappingURL=types.js.map