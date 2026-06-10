import { describe, it, expect } from 'vitest'
import {
  LINEAGE_EMOJI,
  LINEAGE_LABELS,
  lineageEmoji,
  lineageLabel,
  lineageAccent,
  lineageGradient,
} from '~/utils/lineage'

describe('LINEAGE_EMOJI', () => {
  it('has an entry for each canonical starter lineage', () => {
    const lineages = [
      'fire',
      'water',
      'grass',
      'electric',
      'eevee',
      'chikorita',
      'cyndaquil',
      'totodile',
    ]
    for (const l of lineages) {
      expect(LINEAGE_EMOJI[l]).toBeDefined()
      expect(LINEAGE_EMOJI[l]?.length).toBeGreaterThan(0)
    }
  })
})

describe('LINEAGE_LABELS', () => {
  it('has an English label for each canonical starter lineage', () => {
    expect(LINEAGE_LABELS.fire).toBe('Fire')
    expect(LINEAGE_LABELS.water).toBe('Water')
    expect(LINEAGE_LABELS.chikorita).toBe('Grass (Johto)')
  })
})

describe('lineageEmoji', () => {
  it('returns the curated emoji for a starter lineage', () => {
    expect(lineageEmoji('fire')).toBe('🔥')
    expect(lineageEmoji('water')).toBe('💧')
    expect(lineageEmoji('chikorita')).toBe('🌱')
  })

  it('resolves wild / traded lineages to their canonical type emoji', () => {
    expect(lineageEmoji('psyduck')).toBe('💧') // water
    expect(lineageEmoji('trade-dratini')).toBe('🐉') // dragon
    expect(lineageEmoji('gengar')).toBe('👻') // ghost
  })

  it('falls back to the normal-type emoji for an unknown species, ❓ for empty', () => {
    expect(lineageEmoji('zzz-not-a-species')).toBe('⭐') // unknown → normal
    expect(lineageEmoji(null)).toBe('❓')
    expect(lineageEmoji(undefined)).toBe('❓')
    expect(lineageEmoji('')).toBe('❓')
  })
})

describe('lineageLabel', () => {
  it('keeps the curated label for starters', () => {
    expect(lineageLabel('cyndaquil')).toBe('Fire (Johto)')
  })

  it('shows the canonical type for wild / traded Pokémon', () => {
    expect(lineageLabel('psyduck')).toBe('Water')
    expect(lineageLabel('trade-dratini')).toBe('Dragon')
  })

  it('returns — for null', () => {
    expect(lineageLabel(null)).toBe('—')
  })
})

describe('lineageAccent', () => {
  it('returns the starter accent hex', () => {
    expect(lineageAccent('fire')).toBe('#ef6c00')
  })

  it('returns a type accent for wilds and the UI fallback for null', () => {
    expect(lineageAccent('psyduck')).toMatch(/^#[0-9a-f]{6}$/i)
    expect(lineageAccent(null)).toContain('--accent')
  })
})

describe('lineageGradient', () => {
  it('returns a curated gradient for starters and a derived one for wilds', () => {
    expect(lineageGradient('fire')).toContain('linear-gradient')
    expect(lineageGradient('psyduck')).toContain('linear-gradient')
    expect(lineageGradient(null)).toBe('none')
  })
})
