// Wild zones for the web-native gameplay loop (Sprint 4.5).
//
// 8 thematic level-bracketed zones inspired by Pokéchill + canon Pokémon
// geography (Kanto + Johto). Each zone has a `wild_pool` (subset of the
// existing 251-species pokédex), plus optional rare and legendary pools
// with lower roll weights.
//
// Anti-cheat is built in :
//   - cooldown : 20 s per (anon_id, zone_id) — naturally caps XP rate
//   - level bracket : trainer below `level_min - 10` is locked out ; above
//     `level_max + 10` gets XP × 0.1 (handled in Sprint 4.6 fight resolver)
//
// Species IDs reference the lower-case Showdown ids used by the pokédex
// (api/src/lib/moves.ts STAGE_MOVES + arena/app/data/wild-pool-gen*.json).
//
// To add a zone : append below, no migration needed — zones are pure data
// and the explore handler reads from this static array on every request.

export interface WildZone {
  /** URL-safe id (lower-case, hyphenated). Stable across reloads. */
  id: string
  /** Display name FR (web is FR-first per ADR-008). */
  name_fr: string
  /** Display name EN. */
  name_en: string
  /** Single-emoji label for compact lists / map markers. */
  emoji: string
  /** Short flavor text shown when the player enters the zone. */
  flavor_fr: string
  /** Inclusive level brackets. A trainer is "in bracket" if their level
   * is within [level_min - 10, level_max + 10]. Strictly below the lower
   * bound locks them out ; strictly above the upper bound XP is heavily
   * reduced (Sprint 4.6). Wild encounter levels are picked uniformly
   * within [level_min, level_max]. */
  level_min: number
  level_max: number
  /** Common species (highest roll weight). Showdown ids. */
  wild_pool: string[]
  /** Rare species (mid-tier weight, ~15%). Empty array allowed. */
  rare_pool?: string[]
  /** Legendary species (~2%). Empty array allowed. */
  legendary_pool?: string[]
}

export const ZONES: WildZone[] = [
  {
    id: 'route-1',
    name_fr: 'Route 1',
    name_en: 'Route 1',
    emoji: '🌱',
    flavor_fr: 'Une route paisible bordée de hautes herbes. Idéale pour débuter.',
    level_min: 1,
    level_max: 10,
    wild_pool: ['pidgey', 'rattata', 'caterpie', 'weedle', 'spearow', 'sentret', 'hoothoot'],
    rare_pool: ['pidgeotto'],
  },
  {
    id: 'foret-jade',
    name_fr: 'Forêt de Jade',
    name_en: 'Viridian Forest',
    emoji: '🌳',
    flavor_fr: "Une dense forêt grouillant d'insectes et de Pokémon Plante.",
    level_min: 11,
    level_max: 20,
    wild_pool: [
      'caterpie',
      'metapod',
      'weedle',
      'kakuna',
      'oddish',
      'bellsprout',
      'paras',
      'venonat',
      'hoppip',
      'skiploom',
    ],
    rare_pool: ['butterfree', 'beedrill', 'pikachu'],
  },
  {
    id: 'mont-selenite',
    name_fr: 'Mont Sélénite',
    name_en: 'Mt. Moon',
    emoji: '⛰️',
    flavor_fr: 'Des grottes labyrinthiques aux échos étranges.',
    level_min: 21,
    level_max: 30,
    wild_pool: [
      'zubat',
      'geodude',
      'diglett',
      'sandshrew',
      'machop',
      'cubone',
      'rhyhorn',
      'gloom',
    ],
    rare_pool: ['onix', 'graveler', 'golbat'],
  },
  {
    id: 'centrale',
    name_fr: 'Centrale Électrique',
    name_en: 'Power Plant',
    emoji: '⚡',
    flavor_fr: 'Un complexe industriel parcouru de courants intenses.',
    level_min: 31,
    level_max: 40,
    wild_pool: [
      'magnemite',
      'voltorb',
      'pikachu',
      'mareep',
      'flaaffy',
      'electabuzz',
      'elekid',
    ],
    rare_pool: ['magneton', 'electrode', 'raichu', 'ampharos'],
  },
  {
    id: 'cote-salee',
    name_fr: 'Côte Salée',
    name_en: 'Salt Coast',
    emoji: '🌊',
    flavor_fr: 'Des falaises battues par les vagues, royaume des Pokémon marins.',
    level_min: 41,
    level_max: 50,
    wild_pool: [
      'tentacool',
      'krabby',
      'staryu',
      'horsea',
      'goldeen',
      'shellder',
      'magikarp',
      'seel',
      'remoraid',
      'corsola',
    ],
    rare_pool: ['tentacruel', 'kingler', 'starmie', 'seadra', 'gyarados'],
    legendary_pool: ['lapras'],
  },
  {
    id: 'mont-couronne',
    name_fr: 'Mont Couronné',
    name_en: 'Crown Mountain',
    emoji: '🏔️',
    flavor_fr: 'Une chaîne montagneuse glacée et escarpée. Dangereuse.',
    level_min: 51,
    level_max: 60,
    wild_pool: [
      'larvitar',
      'slugma',
      'pinsir',
      'heracross',
      'sneasel',
      'phanpy',
      'teddiursa',
      'aerodactyl',
    ],
    rare_pool: ['skarmory', 'pupitar', 'magcargo', 'donphan'],
  },
  {
    id: 'tour-pokemon',
    name_fr: 'Tour Pokémon',
    name_en: 'Pokémon Tower',
    emoji: '👻',
    flavor_fr: 'Une tour hantée où les esprits des Pokémon errent la nuit.',
    level_min: 61,
    level_max: 70,
    wild_pool: ['gastly', 'haunter', 'misdreavus', 'houndour', 'murkrow', 'duskull'],
    rare_pool: ['gengar', 'houndoom', 'umbreon', 'absol'],
  },
  {
    id: 'mont-argent',
    name_fr: 'Mont Argent',
    name_en: 'Mt. Silver',
    emoji: '🌌',
    flavor_fr: 'Le sommet inaccessible où vivent les Pokémon les plus puissants.',
    level_min: 71,
    level_max: 100,
    wild_pool: ['dragonair', 'tyranitar', 'kingdra', 'crobat', 'snorlax', 'aerodactyl'],
    rare_pool: ['dragonite', 'charizard', 'blastoise', 'venusaur', 'tyranitar'],
    legendary_pool: [
      'mewtwo',
      'mew',
      'lugia',
      'hooh',
      'celebi',
      'articuno',
      'zapdos',
      'moltres',
      'raikou',
      'entei',
      'suicune',
    ],
  },
]

/** O(1) lookup by zone id. */
export const ZONES_BY_ID: Record<string, WildZone> = Object.fromEntries(
  ZONES.map(z => [z.id, z]),
)

export function getZone(id: string): WildZone | undefined {
  return ZONES_BY_ID[id]
}

/** Hard lock-out : trainer level below `zone.level_min - LOCKOUT_BUFFER` can't
 * enter the zone at all. Returns true if locked. */
export const ZONE_LOCKOUT_BUFFER = 10

export function isZoneLocked(zone: WildZone, trainerLevel: number): boolean {
  return trainerLevel < zone.level_min - ZONE_LOCKOUT_BUFFER
}

/** Encounter / explore mechanics constants. */
export const ZONE_EXPLORE_COOLDOWN_S = 20
export const ZONE_ENCOUNTER_TTL_S = 5 * 60 // pending encounter expires if untouched
/** Roll distribution for /explore : 70 % wild encounter, 25 % item drop,
 * 5 % nothing. Sum must = 1.0. Tuned for engaging pacing without spamming
 * "rien trouvé" results. */
export const ZONE_ROLL_ENCOUNTER = 0.7
export const ZONE_ROLL_ITEM = 0.25
// remainder (5 %) → nothing

/** Within an encounter, weights for common / rare / legendary pools. */
export const ZONE_ENCOUNTER_RARE_WEIGHT = 0.15
export const ZONE_ENCOUNTER_LEGENDARY_WEIGHT = 0.02
// remainder (~83 %) → common pool

/** Shiny rate on wild encounter — same as canonical Gen 2+ Pokémon games. */
export const ZONE_SHINY_RATE = 1 / 4096
