// Pokédex data + filters. Bundled at build time from app/data/.
// Sync workflow : when Gen 3+ ships in claude-pokemon, copy the JSON files,
// add the import here, sync types if shape changes.

import gen1 from '~/data/wild-pool-gen1.json'
import gen2 from '~/data/wild-pool-gen2.json'
import type { WildPokemon, WildPoolFile, Rarity } from '~/types/pokedex'

export const WILD_POKEMON: WildPokemon[] = [
  ...(gen1 as WildPoolFile).wild_pool,
  ...(gen2 as WildPoolFile).wild_pool,
].sort((a, b) => a.national_dex - b.national_dex)

export const TOTAL_POKEDEX = WILD_POKEMON.length // 251

// Map English type names → tailwind text colors. Lineage emojis live elsewhere
// (utils/lineage.ts) ; types are different (Fire/Grass/Bug/...) and used by
// the pokédex grid for tile coloring.
export const TYPE_COLOR: Record<string, string> = {
  Fire: 'text-[#ef6c00]',
  Water: 'text-[#268fff]',
  Grass: 'text-[#64b437]',
  Electric: 'text-[#e5b800]', // slightly darker than #ffda00 for white-bg readability
  Psychic: 'text-[#ef417d]',
  Dark: 'text-[#785e4b]',
  Flying: 'text-[#a8a8d0]',
  Dragon: 'text-[#6e34c9]',
  Poison: 'text-[#903a9c]',
  Normal: 'text-[#888073]',
  Ice: 'text-[#6ccdda]',
  Fighting: 'text-[#c73a37]',
  Bug: 'text-[#91a224]',
  Ground: 'text-[#a87f50]',
  Rock: 'text-[#a08050]',
  Ghost: 'text-[#705898]',
  Steel: 'text-[#7a7a90]',
  Fairy: 'text-[#cf6094]',
}

export function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? 'text-zinc-400'
}

/**
 * Filter the pokédex by generation, type, rarity, and free-text search.
 * Pure function — easy to test.
 */
export interface PokedexFilters {
  gen?: 1 | 2 | 'all'
  type?: string | 'all'
  rarity?: Rarity | 'all'
  query?: string
}

export function filterPokedex(
  pool: readonly WildPokemon[],
  filters: PokedexFilters = {},
): WildPokemon[] {
  const { gen = 'all', type = 'all', rarity = 'all', query = '' } = filters
  const q = query.trim().toLowerCase()
  return pool.filter(p => {
    if (gen === 1 && p.national_dex > 151) return false
    if (gen === 2 && (p.national_dex < 152 || p.national_dex > 251)) return false
    if (type !== 'all' && p.type !== type) return false
    if (rarity !== 'all' && p.rarity !== rarity) return false
    if (q) {
      const haystack = `${p.name_fr} ${p.name_en} ${p.id} ${p.type}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

/**
 * Returns the unique sorted list of types present in the wild pool.
 * Useful for populating the filter dropdown.
 */
export function uniqueTypes(pool: readonly WildPokemon[]): string[] {
  return [...new Set(pool.map(p => p.type))].sort()
}

/** O(1) lookup by id ; returns undefined if not catalogued. Sprint 2.13 UA2. */
const POKEMON_BY_ID: Record<string, WildPokemon> = Object.fromEntries(
  WILD_POKEMON.map(p => [p.id, p]),
)
export function pokemonById(id: string): WildPokemon | undefined {
  return POKEMON_BY_ID[id]
}

/** Pokémon at the previous national_dex slot (or null if first). Used by
 * the species detail page for ← prev navigation. */
export function previousPokemon(p: WildPokemon): WildPokemon | null {
  const idx = WILD_POKEMON.findIndex(x => x.id === p.id)
  return idx > 0 ? WILD_POKEMON[idx - 1]! : null
}

/** Pokémon at the next national_dex slot (or null if last). */
export function nextPokemon(p: WildPokemon): WildPokemon | null {
  const idx = WILD_POKEMON.findIndex(x => x.id === p.id)
  return idx >= 0 && idx < WILD_POKEMON.length - 1 ? WILD_POKEMON[idx + 1]! : null
}
