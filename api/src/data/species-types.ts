// Species → CombatType map for wild encounters (Sprint 4.6).
//
// The battle engine in claude-pokemon-shared uses 5 CombatTypes (fire,
// water, grass, electric, normal). Canonical Pokémon have 18 types ; we
// collapse them via this map :
//
//   Bug              → grass
//   Ground / Rock    → normal
//   Fighting / Poison → normal
//   Flying / Normal  → normal
//   Ghost / Dark     → normal
//   Ice              → water
//   Psychic          → normal
//   Dragon           → normal (mechanically powerful but no advantage in our chart)
//   Steel            → normal
//   Fairy            → normal
//
// Coverage : every species id used in api/src/data/zones.ts wild_pool /
// rare_pool / legendary_pool MUST be present here. Adding a new species
// to a zone without an entry here = encounter fall back to 'normal' via
// the resolver helper.

import type { CombatType } from 'claude-pokemon-shared'

export const SPECIES_COMBAT_TYPE: Record<string, CombatType> = {
  // Route 1
  pidgey: 'normal',
  rattata: 'normal',
  caterpie: 'grass',
  weedle: 'grass',
  spearow: 'normal',
  sentret: 'normal',
  hoothoot: 'normal',
  pidgeotto: 'normal',

  // Forêt de Jade (additional)
  metapod: 'grass',
  kakuna: 'grass',
  oddish: 'grass',
  bellsprout: 'grass',
  paras: 'grass',
  venonat: 'grass',
  hoppip: 'grass',
  skiploom: 'grass',
  butterfree: 'grass',
  beedrill: 'grass',
  pikachu: 'electric',

  // Mont Sélénite
  zubat: 'normal',
  geodude: 'normal',
  diglett: 'normal',
  sandshrew: 'normal',
  machop: 'normal',
  cubone: 'normal',
  rhyhorn: 'normal',
  gloom: 'grass',
  onix: 'normal',
  graveler: 'normal',
  golbat: 'normal',

  // Centrale
  magnemite: 'electric',
  voltorb: 'electric',
  mareep: 'electric',
  flaaffy: 'electric',
  electabuzz: 'electric',
  elekid: 'electric',
  magneton: 'electric',
  electrode: 'electric',
  raichu: 'electric',
  ampharos: 'electric',

  // Côte Salée
  tentacool: 'water',
  krabby: 'water',
  staryu: 'water',
  horsea: 'water',
  goldeen: 'water',
  shellder: 'water',
  magikarp: 'water',
  seel: 'water',
  remoraid: 'water',
  corsola: 'water',
  tentacruel: 'water',
  kingler: 'water',
  starmie: 'water',
  seadra: 'water',
  gyarados: 'water',
  seaking: 'water',
  cloyster: 'water',
  lapras: 'water',

  // Mont Couronné
  larvitar: 'normal',
  slugma: 'fire',
  pinsir: 'grass',
  heracross: 'grass',
  sneasel: 'normal',
  phanpy: 'normal',
  teddiursa: 'normal',
  aerodactyl: 'normal',
  skarmory: 'normal',
  pupitar: 'normal',
  magcargo: 'fire',
  donphan: 'normal',

  // Tour Pokémon
  gastly: 'normal',
  haunter: 'normal',
  gengar: 'normal',
  misdreavus: 'normal',
  houndour: 'fire',
  murkrow: 'normal',
  duskull: 'normal',
  houndoom: 'fire',
  umbreon: 'normal',
  absol: 'normal',

  // Mont Argent
  dragonair: 'normal',
  dragonite: 'normal',
  tyranitar: 'normal',
  kingdra: 'water',
  crobat: 'normal',
  snorlax: 'normal',
  charizard: 'fire',
  blastoise: 'water',
  venusaur: 'grass',
  mewtwo: 'normal',
  mew: 'normal',
  lugia: 'water',
  hooh: 'fire',
  celebi: 'grass',
  articuno: 'water',
  zapdos: 'electric',
  moltres: 'fire',
  raikou: 'electric',
  entei: 'fire',
  suicune: 'water',
}

/** Look up a species' effective combat type. Unknown species default to
 * 'normal' (neutral matchups) — should never happen if zones.ts and this
 * map stay in sync, but safer than a crash. */
export function speciesToCombatType(speciesId: string): CombatType {
  return SPECIES_COMBAT_TYPE[speciesId] ?? 'normal'
}
