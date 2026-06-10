// Pokémon Showdown sprite URL resolution. The lineage stages + stageFor()
// come from the shared package (Sprint 3) ; this file keeps :
//   - STAGE_NAME_FR    : showdown_id → localized French stage name
//   - spriteUrl(...)   : URL builder for the Showdown CDN (gen5/ + ani/ +
//                        back/ + shiny variants)
//   - stageNameFor(...) : convenience wrapper (lineage + level → FR name)
//
// We re-export `stageFor` and the LineageStage type so existing callers
// (`from '~/utils/sprites'`) keep working without churn.

import { LINEAGE_STAGES, stageFor, type LineageStage } from 'claude-pokemon-shared/stages'
import { WILD_POKEMON } from '~/utils/pokedex'

export { stageFor, type LineageStage }

const SHOWDOWN_BASE = 'https://play.pokemonshowdown.com/sprites'

// Species id → FR name, for wild / traded Pokémon (their species id is also
// their Showdown sprite id : psyduck, nidoranf, mrmime, …).
const WILD_NAME_FR = new Map(WILD_POKEMON.map(p => [p.id, p.name_fr]))

function isStarterLineage(lineage: string): boolean {
  return lineage in LINEAGE_STAGES
}

/**
 * Showdown sprite id for any lineage. Starters follow their level-gated stage
 * (charmander → charmeleon → charizard…) ; everything else is a wild / traded
 * species whose lineage IS the Showdown id (with an optional `trade-` prefix).
 * Phase 2.15 — fixes wild Pokémon rendering as a starter sprite.
 */
function showdownIdFor(lineage: string, level: number): string {
  if (isStarterLineage(lineage)) return stageFor(lineage, level).showdown_id
  return lineage.replace(/^trade-/, '')
}

/** Localized French names for every catalogued stage. Keep this in sync with
 * the CLI's lib/data/lineages/*.json display labels. */
export const STAGE_NAME_FR: Record<string, string> = {
  egg: 'Œuf',
  charmander: 'Salamèche',
  charmeleon: 'Reptincel',
  charizard: 'Dracaufeu',
  'charizard-megax': 'Méga-Dracaufeu X',
  'charizard-megay': 'Méga-Dracaufeu Y',
  squirtle: 'Carapuce',
  wartortle: 'Carabaffe',
  blastoise: 'Tortank',
  'blastoise-mega': 'Méga-Tortank',
  'blastoise-gmax': 'Tortank Gigamax',
  bulbasaur: 'Bulbizarre',
  ivysaur: 'Herbizarre',
  venusaur: 'Florizarre',
  'venusaur-mega': 'Méga-Florizarre',
  'venusaur-gmax': 'Florizarre Gigamax',
  pichu: 'Pichu',
  pikachu: 'Pikachu',
  raichu: 'Raichu',
  'raichu-alola': "Raichu d'Alola",
  'pikachu-gmax': 'Pikachu Gigamax',
  eevee: 'Évoli',
  vaporeon: 'Aquali',
  jolteon: 'Voltali',
  flareon: 'Pyroli',
  espeon: 'Mentali',
  umbreon: 'Noctali',
  chikorita: 'Germignon',
  bayleef: 'Macronium',
  meganium: 'Méganium',
  cyndaquil: 'Héricendre',
  quilava: 'Feurisson',
  typhlosion: 'Typhlosion',
  'typhlosion-hisui': "Typhlosion d'Hisui",
  totodile: 'Kaiminus',
  croconaw: 'Crocrodil',
  feraligatr: 'Aligatueur',
}

/**
 * Resolve the Showdown sprite URL for a participant snapshot.
 *
 * @param animated  use animated GIF (only available for Gen 5+ Pokémon, falls
 *                  back gracefully via @error event on the <img> in the consumer).
 * @param back      back-view sprite (Sprint 2.13 UA1 — BW battle style).
 */
export function spriteUrl(opts: {
  lineage: string
  level: number
  isShiny?: boolean
  animated?: boolean
  back?: boolean
}): string {
  const id = showdownIdFor(opts.lineage, opts.level)
  const variant = opts.isShiny ? '-shiny' : ''
  if (opts.back) {
    if (opts.animated) {
      return `${SHOWDOWN_BASE}/ani-back${variant}/${id}.gif`
    }
    return `${SHOWDOWN_BASE}/gen5-back${variant}/${id}.png`
  }
  if (opts.animated) {
    return `${SHOWDOWN_BASE}/ani${variant}/${id}.gif`
  }
  return `${SHOWDOWN_BASE}/gen5${variant}/${id}.png`
}

/** Localized name for the HP pill. Starters use their stage name (Salamèche /
 * Reptincel / …) ; wild / traded Pokémon use their species FR name from the
 * pokédex (Psykokwak, Nidoran♀, …). */
export function stageNameFor(lineage: string, level: number): string {
  const id = showdownIdFor(lineage, level)
  return STAGE_NAME_FR[id] ?? WILD_NAME_FR.get(id) ?? id
}
