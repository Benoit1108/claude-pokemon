// Wild Pokémon entries shape — synced manually with claude-pokemon
// lib/data/wild_pool/gen{N}.json. Bundled at build time (no runtime fetch).

export type Rarity = 'common' | 'rare' | 'legendary'

export interface WildPokemon {
  id: string
  national_dex: number
  name_fr: string
  name_en: string
  type: string
  emoji: string
  rarity: Rarity
}

export interface WildPoolFile {
  wild_pool: WildPokemon[]
}
