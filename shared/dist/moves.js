// Move dictionary + per-stage 4-move sets.
//
// Power coefficient feeds into the existing attack × effectiveness × variance
// pipeline in the live-battle resolver. Range :
//   0.7 — weak utility move
//   1.0 — standard signature move
//   1.5 — final-form ultimate
//
// Names mirror the CLI's lib/data/lineages/*.json. Adding a move here
// requires also adding it (or an equivalent) on the CLI side so the player's
// state.json move catalog stays consistent.
import { LINEAGE_STAGES, stageFor } from './stages.js';
import { lineageToCombatType } from './species.js';
import { GENERATED_MOVES, SPECIES_LEARNSET } from './learnsets.generated.js';
export const MOVES = {
    // Normal-type basics
    Charge: { name: 'Charge', type: 'normal', power: 0.9 },
    Griffe: { name: 'Griffe', type: 'normal', power: 0.95 },
    Morsure: { name: 'Morsure', type: 'normal', power: 1.0 },
    Mâchouille: { name: 'Mâchouille', type: 'normal', power: 1.1 },
    Tranche: { name: 'Tranche', type: 'normal', power: 1.05 },
    Bélier: { name: 'Bélier', type: 'normal', power: 1.2 },
    Damoclès: { name: 'Damoclès', type: 'normal', power: 1.4 },
    Repli: { name: 'Repli', type: 'normal', power: 0.7 },
    'Mimi-Queue': { name: 'Mimi-Queue', type: 'normal', power: 0.8 },
    Rugissement: { name: 'Rugissement', type: 'normal', power: 0.7 },
    Grondement: { name: 'Grondement', type: 'normal', power: 0.7 },
    Brouillard: { name: 'Brouillard', type: 'normal', power: 0.85 },
    "Groz'Yeux": { name: "Groz'Yeux", type: 'normal', power: 0.75 },
    Brûlure: { name: 'Brûlure', type: 'normal', power: 0.95 },
    Réflet: { name: 'Réflet Magik', type: 'normal', power: 0.9 },
    'Vive-Attaque': { name: 'Vive-Attaque', type: 'normal', power: 1.05 },
    // Fire
    Flammèche: { name: 'Flammèche', type: 'fire', power: 1.0 },
    'Lance-Flammes': { name: 'Lance-Flammes', type: 'fire', power: 1.3 },
    'Roue de Feu': { name: 'Roue de Feu', type: 'fire', power: 1.15 },
    'Crocs Feu': { name: 'Crocs Feu', type: 'fire', power: 1.1 },
    Surchauffe: { name: 'Surchauffe', type: 'fire', power: 1.5 },
    Déflagration: { name: 'Déflagration', type: 'fire', power: 1.45 },
    'Vortex Infernal': { name: 'Vortex Infernal', type: 'fire', power: 1.4 },
    // Water
    'Pistolet à O': { name: 'Pistolet à O', type: 'water', power: 1.0 },
    Hydrocanon: { name: 'Hydrocanon', type: 'water', power: 1.4 },
    Hydroblast: { name: 'Hydroblast', type: 'water', power: 1.5 },
    Vibraqua: { name: 'Vibraqua', type: 'water', power: 1.2 },
    "Bulles d'O": { name: "Bulles d'O", type: 'water', power: 1.0 },
    // Grass
    "Tranch'Herbe": { name: "Tranch'Herbe", type: 'grass', power: 1.0 },
    'Lance-Soleil': { name: 'Lance-Soleil', type: 'grass', power: 1.5 },
    Vampigraine: { name: 'Vampigraine', type: 'grass', power: 1.1 },
    Synthèse: { name: 'Synthèse', type: 'grass', power: 0.85 },
    'Poudre Dodo': { name: 'Poudre Dodo', type: 'grass', power: 0.8 },
    'G-Max Vine Lash': { name: 'G-Max Vine Lash', type: 'grass', power: 1.5 },
    // Electric
    Éclair: { name: 'Éclair', type: 'electric', power: 1.0 },
    Tonnerre: { name: 'Tonnerre', type: 'electric', power: 1.3 },
    'Fatal-Foudre': { name: 'Fatal-Foudre', type: 'electric', power: 1.45 },
    "Coup d'Jus": { name: "Coup d'Jus", type: 'electric', power: 1.15 },
    Cataclectric: { name: 'Cataclectric', type: 'electric', power: 1.5 },
    'G-Max Volt Crash': { name: 'G-Max Volt Crash', type: 'electric', power: 1.5 },
    // Eevee evolutions (mostly normal-typed in MVP)
    Psyko: { name: 'Psyko', type: 'normal', power: 1.3 },
    'Vœu Soin': { name: 'Vœu Soin', type: 'normal', power: 0.9 },
    "Ball'Ombre": { name: "Ball'Ombre", type: 'normal', power: 1.2 },
    'Reflet Magik': { name: 'Reflet Magik', type: 'normal', power: 0.9 },
    'Cru-Aile': { name: 'Cru-Aile', type: 'normal', power: 1.15 },
    Dracosouffle: { name: 'Dracosouffle', type: 'normal', power: 1.35 },
};
/** 4 moves per evolution stage. Picked to give type variety + a balance of
 * signature and utility moves. Stages without explicit entries fall back
 * to BASIC_MOVES via movesForStage. */
export const STAGE_MOVES = {
    egg: ['Charge', 'Mimi-Queue', 'Repli', 'Grondement'],
    charmander: ['Charge', 'Griffe', 'Flammèche', 'Grondement'],
    charmeleon: ['Tranche', 'Flammèche', 'Brouillard', 'Brûlure'],
    charizard: ['Lance-Flammes', 'Cru-Aile', 'Tranche', 'Morsure'],
    'charizard-megax': ['Dracosouffle', 'Damoclès', 'Lance-Flammes', 'Tranche'],
    'charizard-megay': ['Lance-Soleil', 'Déflagration', 'Cru-Aile', 'Bélier'],
    squirtle: ['Charge', 'Mimi-Queue', 'Pistolet à O', 'Repli'],
    wartortle: ['Pistolet à O', 'Repli', 'Morsure', 'Tranche'],
    blastoise: ['Hydrocanon', "Bulles d'O", 'Tranche', 'Bélier'],
    'blastoise-mega': ['Hydroblast', 'Vibraqua', 'Bélier', 'Damoclès'],
    'blastoise-gmax': ['Hydroblast', 'Vibraqua', 'Hydrocanon', 'Damoclès'],
    bulbasaur: ['Charge', 'Rugissement', 'Vampigraine', "Tranch'Herbe"],
    ivysaur: ["Tranch'Herbe", 'Vampigraine', 'Poudre Dodo', 'Bélier'],
    venusaur: ['Lance-Soleil', "Tranch'Herbe", 'Vampigraine', 'Bélier'],
    'venusaur-mega': ['Lance-Soleil', 'Vampigraine', 'Bélier', 'Synthèse'],
    'venusaur-gmax': ['G-Max Vine Lash', 'Lance-Soleil', 'Synthèse', 'Vampigraine'],
    pichu: ['Charge', 'Éclair', 'Mimi-Queue', 'Vive-Attaque'],
    pikachu: ['Tonnerre', 'Vive-Attaque', 'Éclair', 'Charge'],
    raichu: ['Fatal-Foudre', "Coup d'Jus", 'Tonnerre', 'Vive-Attaque'],
    'raichu-alola': ['Psyko', 'Tonnerre', 'Vive-Attaque', "Coup d'Jus"],
    'pikachu-gmax': ['G-Max Volt Crash', 'Cataclectric', 'Tonnerre', 'Vive-Attaque'],
    eevee: ['Charge', 'Mimi-Queue', 'Morsure', 'Vive-Attaque'],
    vaporeon: ['Hydrocanon', 'Vibraqua', "Bulles d'O", 'Morsure'],
    jolteon: ['Tonnerre', 'Vive-Attaque', "Coup d'Jus", 'Éclair'],
    flareon: ['Lance-Flammes', 'Crocs Feu', 'Roue de Feu', 'Morsure'],
    espeon: ['Psyko', 'Vœu Soin', 'Vive-Attaque', 'Mimi-Queue'],
    umbreon: ["Ball'Ombre", 'Reflet Magik', 'Morsure', 'Vive-Attaque'],
    chikorita: ['Charge', 'Rugissement', "Tranch'Herbe", 'Mimi-Queue'],
    bayleef: ["Tranch'Herbe", 'Synthèse', 'Vampigraine', 'Bélier'],
    meganium: ['Lance-Soleil', 'Bélier', 'Synthèse', "Tranch'Herbe"],
    cyndaquil: ['Charge', "Groz'Yeux", 'Flammèche', 'Brouillard'],
    quilava: ['Roue de Feu', 'Brouillard', 'Flammèche', 'Vive-Attaque'],
    typhlosion: ['Lance-Flammes', 'Surchauffe', 'Roue de Feu', 'Tranche'],
    'typhlosion-hisui': ['Vortex Infernal', "Ball'Ombre", 'Lance-Flammes', 'Reflet Magik'],
    totodile: ['Charge', 'Rugissement', 'Pistolet à O', 'Morsure'],
    croconaw: ['Morsure', 'Pistolet à O', 'Tranche', 'Vive-Attaque'],
    feraligatr: ['Hydrocanon', 'Mâchouille', 'Tranche', 'Bélier'],
};
const BASIC_MOVES = ['Charge', 'Mimi-Queue', 'Morsure', 'Tranche'];
function basicMoves() {
    return BASIC_MOVES.map(n => MOVES[n] ?? MOVES.Charge);
}
/** The four moves available at a given stage. Falls back to a basic set when
 * the stage isn't catalogued so battles never get stuck without options. */
export function movesForStage(showdownId) {
    const names = STAGE_MOVES[showdownId];
    if (!names)
        return basicMoves();
    return names.map(n => MOVES[n] ?? MOVES.Charge);
}
function isStarterLineage(lineage) {
    return lineage in LINEAGE_STAGES;
}
/** Pick the 4 most-recently-learned offensive moves a species knows by `level`
 * from its generated learnset, guaranteeing at least one STAB move when one is
 * learnable. Used for wild / traded Pokémon that have no curated stage moveset.
 * Falls back to the basic set if the species isn't in the learnset data. */
function movesFromLearnset(speciesId, level, stab) {
    const learnset = SPECIES_LEARNSET[speciesId];
    if (!learnset?.length)
        return basicMoves();
    const learnable = learnset.filter(e => e.level <= level);
    const pool = learnable.length ? learnable : learnset.slice(0, 1);
    let chosen = pool.slice(-4);
    if (!chosen.some(e => GENERATED_MOVES[e.move]?.type === stab)) {
        const stabMoves = pool.filter(e => GENERATED_MOVES[e.move]?.type === stab);
        const bestStab = stabMoves[stabMoves.length - 1];
        if (bestStab)
            chosen = [...chosen.slice(0, 3), bestStab];
    }
    const moves = chosen
        .map(e => GENERATED_MOVES[e.move])
        .filter((m) => Boolean(m));
    return moves.length ? moves : basicMoves();
}
/** Convenience wrapper : (lineage, level) → 4 moves available at that tier.
 * Starter lineages keep their hand-curated stage movesets ; any other lineage
 * (wild / traded species) resolves its moveset from the level-up learnset. */
export function movesForParticipant(lineage, level) {
    if (isStarterLineage(lineage)) {
        return movesForStage(stageFor(lineage, level).showdown_id);
    }
    const speciesId = lineage.replace(/^trade-/, '');
    return movesFromLearnset(speciesId, level, lineageToCombatType(lineage));
}
//# sourceMappingURL=moves.js.map