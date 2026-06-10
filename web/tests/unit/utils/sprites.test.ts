import { describe, it, expect } from 'vitest'
// Sprint 3 — LINEAGE_STAGES moved to claude-pokemon-shared/stages. We
// import it directly from there ; the rest still flows through ~/utils/sprites.
import { LINEAGE_STAGES } from 'claude-pokemon-shared/stages'
import { spriteUrl, stageFor, stageNameFor } from '~/utils/sprites'

describe('LINEAGE_STAGES', () => {
  it('has all 8 lineages from the CLI', () => {
    const expected = [
      'fire',
      'water',
      'grass',
      'electric',
      'eevee',
      'chikorita',
      'cyndaquil',
      'totodile',
    ]
    for (const lin of expected) {
      expect(LINEAGE_STAGES).toHaveProperty(lin)
      expect(LINEAGE_STAGES[lin as keyof typeof LINEAGE_STAGES].length).toBeGreaterThan(0)
    }
  })

  it('every lineage starts with an egg stage at min_level 0', () => {
    for (const lin of Object.keys(LINEAGE_STAGES)) {
      const stages = LINEAGE_STAGES[lin as keyof typeof LINEAGE_STAGES]
      expect(stages[0]?.min_level).toBe(0)
      expect(stages[0]?.showdown_id).toBe('egg')
    }
  })

  it('every lineage has stage 1 (post-hatch) at min_level 1', () => {
    for (const lin of Object.keys(LINEAGE_STAGES)) {
      const stages = LINEAGE_STAGES[lin as keyof typeof LINEAGE_STAGES]
      expect(stages[1]?.min_level).toBe(1)
    }
  })
})

describe('stageFor', () => {
  it('returns egg at level 0', () => {
    expect(stageFor('fire', 0).showdown_id).toBe('egg')
    expect(stageFor('water', 0).showdown_id).toBe('egg')
  })

  it('returns the post-hatch stage at Lv.1', () => {
    expect(stageFor('fire', 1).showdown_id).toBe('charmander')
    expect(stageFor('water', 1).showdown_id).toBe('squirtle')
    expect(stageFor('grass', 1).showdown_id).toBe('bulbasaur')
    expect(stageFor('electric', 1).showdown_id).toBe('pichu')
    expect(stageFor('eevee', 1).showdown_id).toBe('eevee')
  })

  it('Pikachu evolution at Lv.10 (electric special case)', () => {
    expect(stageFor('electric', 9).showdown_id).toBe('pichu')
    expect(stageFor('electric', 10).showdown_id).toBe('pikachu')
  })

  it('first major evolutions at Lv.16', () => {
    expect(stageFor('fire', 15).showdown_id).toBe('charmander')
    expect(stageFor('fire', 16).showdown_id).toBe('charmeleon')
    expect(stageFor('water', 16).showdown_id).toBe('wartortle')
    expect(stageFor('grass', 16).showdown_id).toBe('ivysaur')
  })

  it('Eevee Lv.30+ defaults to vaporeon (first listed at min_level 30)', () => {
    expect(stageFor('eevee', 29).showdown_id).toBe('eevee')
    expect(stageFor('eevee', 30).showdown_id).toBe('vaporeon')
    expect(stageFor('eevee', 50).showdown_id).toBe('vaporeon')
  })

  it('Lv.36 final form for fire/water', () => {
    expect(stageFor('fire', 36).showdown_id).toBe('charizard')
    expect(stageFor('water', 36).showdown_id).toBe('blastoise')
  })

  it('Lv.32 final form for shorter Johto lineages (3 stages only)', () => {
    expect(stageFor('chikorita', 32).showdown_id).toBe('meganium')
    expect(stageFor('totodile', 32).showdown_id).toBe('feraligatr')
  })

  it('Mega forms at Lv.55 where defined', () => {
    expect(stageFor('fire', 55).showdown_id).toBe('charizard-megax')
    expect(stageFor('water', 55).showdown_id).toBe('blastoise-mega')
  })

  it('caps at the highest stage at Lv.100', () => {
    expect(stageFor('fire', 100).showdown_id).toBe('charizard-megay')
    expect(stageFor('electric', 100).showdown_id).toBe('pikachu-gmax')
  })

  it('falls back to fire stages for unknown lineage', () => {
    expect(stageFor('mystery_unknown', 16).showdown_id).toBe('charmeleon')
  })
})

describe('spriteUrl', () => {
  it('builds the static gen5 PNG URL by default', () => {
    expect(spriteUrl({ lineage: 'fire', level: 1 })).toBe(
      'https://play.pokemonshowdown.com/sprites/gen5/charmander.png',
    )
  })

  it('builds the animated GIF URL when animated=true', () => {
    expect(spriteUrl({ lineage: 'fire', level: 1, animated: true })).toBe(
      'https://play.pokemonshowdown.com/sprites/ani/charmander.gif',
    )
  })

  it('uses the -shiny variant when isShiny=true', () => {
    expect(spriteUrl({ lineage: 'fire', level: 1, isShiny: true })).toBe(
      'https://play.pokemonshowdown.com/sprites/gen5-shiny/charmander.png',
    )
    expect(spriteUrl({ lineage: 'fire', level: 1, isShiny: true, animated: true })).toBe(
      'https://play.pokemonshowdown.com/sprites/ani-shiny/charmander.gif',
    )
  })

  it('reflects the level (Lv.16 = charmeleon, Lv.36 = charizard)', () => {
    expect(spriteUrl({ lineage: 'fire', level: 16 })).toContain('charmeleon')
    expect(spriteUrl({ lineage: 'fire', level: 36 })).toContain('charizard.png')
    expect(spriteUrl({ lineage: 'fire', level: 55 })).toContain('charizard-megax')
  })

  it('resolves wild / traded species to their own Showdown sprite (Phase 2.15)', () => {
    expect(spriteUrl({ lineage: 'trade-psyduck', level: 12 })).toBe(
      'https://play.pokemonshowdown.com/sprites/gen5/psyduck.png',
    )
    expect(spriteUrl({ lineage: 'psyduck', level: 12, back: true })).toBe(
      'https://play.pokemonshowdown.com/sprites/gen5-back/psyduck.png',
    )
    expect(spriteUrl({ lineage: 'trade-lapras', level: 41, animated: true })).toBe(
      'https://play.pokemonshowdown.com/sprites/ani/lapras.gif',
    )
  })
})

describe('stageNameFor', () => {
  it('returns the human-readable French name', () => {
    expect(stageNameFor('fire', 1)).toBe('Salamèche')
    expect(stageNameFor('fire', 16)).toBe('Reptincel')
    expect(stageNameFor('fire', 36)).toBe('Dracaufeu')
    expect(stageNameFor('eevee', 30)).toBe('Aquali')
  })

  it('returns "Œuf" at level 0', () => {
    expect(stageNameFor('fire', 0)).toBe('Œuf')
    expect(stageNameFor('water', 0)).toBe('Œuf')
  })

  it('uses the species FR name for wild / traded Pokémon (Phase 2.15)', () => {
    expect(stageNameFor('trade-psyduck', 12)).toBe('Psykokwak')
    expect(stageNameFor('gengar', 30)).toBe('Ectoplasma')
  })
})
