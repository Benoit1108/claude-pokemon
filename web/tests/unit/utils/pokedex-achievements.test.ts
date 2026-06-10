import { describe, it, expect } from 'vitest'
import { computePokedexAchievements } from '~/utils/pokedex-achievements'
import { WILD_POKEMON } from '~/utils/pokedex'

describe('computePokedexAchievements', () => {
  it('handles an empty / missing seen list', () => {
    for (const input of [undefined, null, []] as const) {
      const a = computePokedexAchievements(input)
      expect(a.total).toBe(251)
      expect(a.seen).toBe(0)
      expect(a.pct).toBe(0)
      expect(a.legendariesSeen).toEqual([])
      expect(a.milestones.every(m => !m.achieved)).toBe(true)
    }
  })

  it('splits totals by generation (151 / 100)', () => {
    const a = computePokedexAchievements([])
    expect(a.perGen).toHaveLength(2)
    expect(a.perGen[0]).toMatchObject({ gen: 1, total: 151, seen: 0 })
    expect(a.perGen[1]).toMatchObject({ gen: 2, total: 100, seen: 0 })
  })

  it('detects starters / rare / legendary milestones', () => {
    const a = computePokedexAchievements(['bulbasaur', 'charmander', 'squirtle', 'mewtwo'])
    const ms = Object.fromEntries(a.milestones.map(m => [m.key, m.achieved]))
    expect(ms.gen1_starters).toBe(true)
    expect(ms.saw_legendary).toBe(true)
    expect(a.legendariesSeen.map(p => p.id)).toContain('mewtwo')
    expect(ms.pct_25).toBe(false) // only 4/251
  })

  it('flags saw_rare from a rare-rarity species', () => {
    const rare = WILD_POKEMON.find(p => p.rarity === 'rare')!
    const a = computePokedexAchievements([rare.id])
    expect(a.milestones.find(m => m.key === 'saw_rare')?.achieved).toBe(true)
  })

  it('reaches 100% + all milestones when every species is seen', () => {
    const a = computePokedexAchievements(WILD_POKEMON.map(p => p.id))
    expect(a.seen).toBe(251)
    expect(a.pct).toBe(100)
    expect(a.perGen.every(g => g.pct === 100)).toBe(true)
    expect(a.milestones.every(m => m.achieved)).toBe(true)
    expect(a.legendariesSeen.length).toBeGreaterThan(0)
  })
})
