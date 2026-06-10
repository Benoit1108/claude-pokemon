import { describe, it, expect } from 'vitest'
import {
  WILD_POKEMON,
  TOTAL_POKEDEX,
  TYPE_COLOR,
  typeColor,
  filterPokedex,
  nextPokemon,
  pokemonById,
  previousPokemon,
  uniqueTypes,
} from '~/utils/pokedex'

describe('WILD_POKEMON', () => {
  it('contains 251 Pokémon (Gen 1 + Gen 2)', () => {
    expect(TOTAL_POKEDEX).toBe(251)
    expect(WILD_POKEMON).toHaveLength(251)
  })

  it('is sorted by national_dex ascending', () => {
    for (let i = 1; i < WILD_POKEMON.length; i++) {
      expect(WILD_POKEMON[i]!.national_dex).toBeGreaterThan(WILD_POKEMON[i - 1]!.national_dex)
    }
  })

  it('starts with #1 Bulbasaur and ends with #251 Celebi', () => {
    expect(WILD_POKEMON[0]?.id).toBe('bulbasaur')
    expect(WILD_POKEMON[0]?.national_dex).toBe(1)
    expect(WILD_POKEMON[250]?.id).toBe('celebi')
    expect(WILD_POKEMON[250]?.national_dex).toBe(251)
  })

  it('all entries have required fields', () => {
    for (const p of WILD_POKEMON) {
      expect(p.id).toBeTruthy()
      expect(p.national_dex).toBeGreaterThan(0)
      expect(p.name_fr).toBeTruthy()
      expect(p.name_en).toBeTruthy()
      expect(p.type).toBeTruthy()
      expect(p.emoji).toBeTruthy()
      expect(['common', 'rare', 'legendary']).toContain(p.rarity)
    }
  })
})

describe('typeColor', () => {
  it('returns mapped color for known types', () => {
    expect(typeColor('Fire')).toBe(TYPE_COLOR.Fire)
    expect(typeColor('Water')).toBe(TYPE_COLOR.Water)
    expect(typeColor('Steel')).toBe(TYPE_COLOR.Steel)
  })

  it('falls back to zinc-400 for unknown type', () => {
    expect(typeColor('Cosmic')).toBe('text-zinc-400')
  })
})

describe('filterPokedex', () => {
  it('returns all 251 when no filter', () => {
    expect(filterPokedex(WILD_POKEMON)).toHaveLength(251)
  })

  it('filters by Gen 1 (#1-151)', () => {
    const filtered = filterPokedex(WILD_POKEMON, { gen: 1 })
    expect(filtered).toHaveLength(151)
    expect(filtered.every(p => p.national_dex <= 151)).toBe(true)
  })

  it('filters by Gen 2 (#152-251)', () => {
    const filtered = filterPokedex(WILD_POKEMON, { gen: 2 })
    expect(filtered).toHaveLength(100)
    expect(filtered.every(p => p.national_dex >= 152 && p.national_dex <= 251)).toBe(true)
  })

  it('filters by type', () => {
    const fires = filterPokedex(WILD_POKEMON, { type: 'Fire' })
    expect(fires.every(p => p.type === 'Fire')).toBe(true)
    expect(fires.length).toBeGreaterThan(0)
  })

  it('filters by rarity legendary (Gen 1+2 = 5+6 = 11)', () => {
    const legends = filterPokedex(WILD_POKEMON, { rarity: 'legendary' })
    expect(legends).toHaveLength(11)
    expect(legends.map(p => p.id)).toContain('mewtwo')
    expect(legends.map(p => p.id)).toContain('lugia')
  })

  it('filters by query (matches name_fr, name_en, id, type)', () => {
    expect(filterPokedex(WILD_POKEMON, { query: 'mew' }).length).toBeGreaterThan(0)
    expect(filterPokedex(WILD_POKEMON, { query: 'pikachu' }).map(p => p.id)).toContain('pikachu')
    expect(filterPokedex(WILD_POKEMON, { query: 'PIKACHU' }).map(p => p.id)).toContain('pikachu') // case-insensitive
  })

  it('combines multiple filters (AND)', () => {
    const filtered = filterPokedex(WILD_POKEMON, { gen: 1, type: 'Fire', rarity: 'common' })
    expect(
      filtered.every(p => p.national_dex <= 151 && p.type === 'Fire' && p.rarity === 'common'),
    ).toBe(true)
  })

  it('returns empty when no match', () => {
    expect(filterPokedex(WILD_POKEMON, { query: 'xxxxxxxxxxxxx' })).toHaveLength(0)
  })

  it('treats "all" as no filter', () => {
    expect(filterPokedex(WILD_POKEMON, { gen: 'all', type: 'all', rarity: 'all' })).toHaveLength(
      251,
    )
  })
})

describe('uniqueTypes', () => {
  it('returns sorted unique types from the pool', () => {
    const types = uniqueTypes(WILD_POKEMON)
    expect(types).toContain('Fire')
    expect(types).toContain('Water')
    expect(types).toContain('Steel') // Gen 2 introduced
    expect(types).toContain('Dark') // Gen 2 introduced
    // Sorted alphabetically
    for (let i = 1; i < types.length; i++) {
      expect(types[i]!.localeCompare(types[i - 1]!)).toBeGreaterThan(0)
    }
  })
})

describe('pokemonById / previousPokemon / nextPokemon (Sprint 2.13 UA2)', () => {
  it('pokemonById finds a known species', () => {
    const p = pokemonById('pikachu')
    expect(p).toBeDefined()
    expect(p?.national_dex).toBe(25)
  })

  it('pokemonById returns undefined on unknown id', () => {
    expect(pokemonById('not-a-pokemon')).toBeUndefined()
  })

  it('previousPokemon returns null for the first species', () => {
    const first = WILD_POKEMON[0]!
    expect(previousPokemon(first)).toBeNull()
  })

  it('previousPokemon walks back by national_dex', () => {
    const p = pokemonById('pikachu')!
    const prev = previousPokemon(p)
    expect(prev?.national_dex).toBe(24) // Raichu = 26, Pikachu = 25, Raichu prev = 24 (raichu? no — index based not dex)
    // Actually we walk by index in the (sorted-by-dex) WILD_POKEMON array,
    // so prev is national_dex 24 (Arbok). Either way it's exactly one before.
    expect(prev?.national_dex).toBe(p.national_dex - 1)
  })

  it('nextPokemon returns null for the last species', () => {
    const last = WILD_POKEMON[WILD_POKEMON.length - 1]!
    expect(nextPokemon(last)).toBeNull()
    expect(last.national_dex).toBe(251)
  })

  it('nextPokemon walks forward by national_dex', () => {
    const p = pokemonById('pikachu')!
    const next = nextPokemon(p)
    expect(next?.national_dex).toBe(p.national_dex + 1)
  })
})
