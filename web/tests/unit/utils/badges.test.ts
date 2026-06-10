import { describe, it, expect } from 'vitest'
import { BADGE_META, TOTAL_BADGES, badgeMeta } from '~/utils/badges'

describe('BADGE_META', () => {
  it('has exactly 19 badges (matches CLI total)', () => {
    // 7 generic + 4 dex (Sprint 2.11) + 8 master (5 Gen 1 + 3 Gen 2) = 19
    expect(TOTAL_BADGES).toBe(19)
    expect(Object.keys(BADGE_META)).toHaveLength(19)
  })

  it('exposes the four pokédex milestone badges (Sprint 2.11)', () => {
    for (const id of ['dex_50', 'dex_100', 'regional_kanto', 'regional_johto']) {
      expect(BADGE_META[id]).toBeDefined()
      expect(BADGE_META[id]?.emoji).toBeTruthy()
    }
  })

  it('has 7 generic badges', () => {
    const generic = [
      'hatch',
      'first_evolution',
      'first_shiny',
      'champion',
      'centurion',
      'constellation',
      'master_pokedex',
    ]
    for (const id of generic) {
      expect(BADGE_META[id]).toBeDefined()
      expect(BADGE_META[id]?.emoji).toBeTruthy()
      expect(BADGE_META[id]?.label).toBeTruthy()
    }
  })

  it('has 8 master badges (5 Gen 1 + 3 Gen 2)', () => {
    const masters = [
      'master_fire',
      'master_water',
      'master_grass',
      'master_electric',
      'master_eevee',
      'master_chikorita',
      'master_cyndaquil',
      'master_totodile',
    ]
    for (const id of masters) {
      expect(BADGE_META[id]?.emoji).toBeTruthy()
      expect(BADGE_META[id]?.label).toContain('Master')
    }
  })
})

describe('badgeMeta', () => {
  it('returns the right meta for known id', () => {
    expect(badgeMeta('hatch')).toEqual({
      emoji: '🥚',
      label: 'Hatch',
      description: 'First egg hatched (Lv.0 → Lv.1)',
    })
  })

  it('falls back to ❓ + id for unknown badge', () => {
    const meta = badgeMeta('mystery_badge')
    expect(meta.emoji).toBe('❓')
    expect(meta.label).toBe('mystery_badge')
    expect(meta.description).toBe('Unknown badge')
  })
})
