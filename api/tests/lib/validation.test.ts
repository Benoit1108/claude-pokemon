import { describe, it, expect } from 'vitest'
import { validateSubmit } from '../../src/lib/validation'

const validPayload = {
  anon_id: 'abc12345',
  schema_version: 1,
  client_version: '1.0.0-test',
  submitted_at: '2026-05-06T10:00:00Z',
  stats: {
    lifetime: {
      total_tokens: 100,
      total_evolutions: 0,
      total_shinies: 0,
      max_level: 0,
      total_compagnons: 1,
      lineages_completed: [],
      games_won: 0,
      games_played: 0,
    },
    active: {
      lineage: 'fire',
      current_level: 5,
      is_shiny: false,
    },
    badges: [],
    pokedex_seen_count: 0,
  },
}

describe('validateSubmit', () => {
  it('accepts a minimal valid payload', () => {
    expect(validateSubmit(validPayload)).toEqual([])
  })

  it('rejects non-object body', () => {
    expect(validateSubmit(null)).toContain('body must be object')
    expect(validateSubmit('string')).toContain('body must be object')
    expect(validateSubmit(42)).toContain('body must be object')
  })

  it('rejects malformed anon_id', () => {
    const errs = validateSubmit({ ...validPayload, anon_id: 'BAD-ID!' })
    expect(errs.some(e => e.includes('anon_id'))).toBe(true)
  })

  it('rejects anon_id too short or too long', () => {
    expect(
      validateSubmit({ ...validPayload, anon_id: 'abc' }).some(e => e.includes('anon_id')),
    ).toBe(true)
    expect(
      validateSubmit({ ...validPayload, anon_id: 'a'.repeat(20) }).some(e => e.includes('anon_id')),
    ).toBe(true)
  })

  it('accepts optional null/empty display_name', () => {
    expect(validateSubmit({ ...validPayload, display_name: null })).toEqual([])
    expect(validateSubmit({ ...validPayload, display_name: '' })).toEqual([])
    expect(validateSubmit({ ...validPayload, display_name: undefined })).toEqual([])
  })

  it('accepts valid display_name', () => {
    expect(validateSubmit({ ...validPayload, display_name: 'cool_user-123' })).toEqual([])
  })

  it('rejects display_name with disallowed chars', () => {
    const errs = validateSubmit({ ...validPayload, display_name: 'has space' })
    expect(errs.some(e => e.includes('display_name'))).toBe(true)
    const errs2 = validateSubmit({ ...validPayload, display_name: 'has!bang' })
    expect(errs2.some(e => e.includes('display_name'))).toBe(true)
  })

  it('accepts optional null/empty/undefined quote', () => {
    expect(validateSubmit({ ...validPayload, quote: null })).toEqual([])
    expect(validateSubmit({ ...validPayload, quote: '' })).toEqual([])
    expect(validateSubmit({ ...validPayload, quote: undefined })).toEqual([])
  })

  it('accepts a valid quote (≤80 chars, single line)', () => {
    expect(validateSubmit({ ...validPayload, quote: "Catch 'em all!" })).toEqual([])
    expect(validateSubmit({ ...validPayload, quote: 'a'.repeat(80) })).toEqual([])
  })

  it('rejects a quote longer than 80 chars', () => {
    const errs = validateSubmit({ ...validPayload, quote: 'a'.repeat(81) })
    expect(errs.some(e => e.includes('quote'))).toBe(true)
  })

  it('rejects a quote with newlines (single-line only)', () => {
    const errs = validateSubmit({ ...validPayload, quote: 'first\nsecond' })
    expect(errs.some(e => e.includes('single line'))).toBe(true)
    const errs2 = validateSubmit({ ...validPayload, quote: 'first\rsecond' })
    expect(errs2.some(e => e.includes('single line'))).toBe(true)
  })

  it('rejects a non-string quote', () => {
    const errs = validateSubmit({ ...validPayload, quote: 123 })
    expect(errs.some(e => e.includes('quote'))).toBe(true)
  })

  // -------------------------------------------------------------------------
  // bio (Sprint 2.9)
  // -------------------------------------------------------------------------

  it('accepts optional null/empty/undefined bio', () => {
    expect(validateSubmit({ ...validPayload, bio: null })).toEqual([])
    expect(validateSubmit({ ...validPayload, bio: '' })).toEqual([])
    expect(validateSubmit({ ...validPayload, bio: undefined })).toEqual([])
  })

  it('accepts a valid bio (≤160 chars, ≤4 lines)', () => {
    expect(validateSubmit({ ...validPayload, bio: 'A simple bio.' })).toEqual([])
    expect(validateSubmit({ ...validPayload, bio: 'a'.repeat(160) })).toEqual([])
    expect(validateSubmit({ ...validPayload, bio: 'L1\nL2\nL3\nL4' })).toEqual([])
  })

  it('rejects a bio longer than 160 chars', () => {
    const errs = validateSubmit({ ...validPayload, bio: 'a'.repeat(161) })
    expect(errs.some(e => e.includes('bio'))).toBe(true)
  })

  it('rejects a bio with more than 4 lines', () => {
    const errs = validateSubmit({ ...validPayload, bio: '1\n2\n3\n4\n5' })
    expect(errs.some(e => e.includes('4 lines'))).toBe(true)
  })

  it('rejects a non-string bio', () => {
    const errs = validateSubmit({ ...validPayload, bio: 42 })
    expect(errs.some(e => e.includes('bio'))).toBe(true)
  })

  // -------------------------------------------------------------------------
  // pinned_badges (Sprint 2.9)
  // -------------------------------------------------------------------------

  it('accepts null/empty/undefined pinned_badges', () => {
    expect(validateSubmit({ ...validPayload, pinned_badges: null })).toEqual([])
    expect(validateSubmit({ ...validPayload, pinned_badges: [] })).toEqual([])
    expect(validateSubmit({ ...validPayload, pinned_badges: undefined })).toEqual([])
  })

  it('accepts up to 3 valid pinned badges', () => {
    expect(
      validateSubmit({
        ...validPayload,
        pinned_badges: ['hatch', 'first_evolution', 'champion'],
      }),
    ).toEqual([])
  })

  it('rejects more than 3 pinned badges', () => {
    const errs = validateSubmit({
      ...validPayload,
      pinned_badges: ['hatch', 'first_evolution', 'champion', 'centurion'],
    })
    expect(errs.some(e => e.includes('pinned_badges'))).toBe(true)
  })

  it('rejects unknown pinned badge keys', () => {
    const errs = validateSubmit({ ...validPayload, pinned_badges: ['mystery_badge'] })
    expect(errs.some(e => e.includes('unknown pinned badge'))).toBe(true)
  })

  it('rejects duplicate pinned badges', () => {
    const errs = validateSubmit({
      ...validPayload,
      pinned_badges: ['hatch', 'hatch'],
    })
    expect(errs.some(e => e.includes('duplicate'))).toBe(true)
  })

  it('rejects non-array pinned_badges', () => {
    const errs = validateSubmit({ ...validPayload, pinned_badges: 'hatch' })
    expect(errs.some(e => e.includes('pinned_badges'))).toBe(true)
  })

  it('rejects display_name shorter than 2 chars', () => {
    const errs = validateSubmit({ ...validPayload, display_name: 'a' })
    expect(errs.some(e => e.includes('display_name'))).toBe(true)
  })

  it('rejects schema_version mismatch', () => {
    const errs = validateSubmit({ ...validPayload, schema_version: 2 })
    expect(errs.some(e => e.includes('schema_version'))).toBe(true)
  })

  it('rejects unknown lineage', () => {
    const payload = {
      ...validPayload,
      stats: {
        ...validPayload.stats,
        lifetime: { ...validPayload.stats.lifetime, lineages_completed: ['pikachu_lineage'] },
      },
    }
    expect(validateSubmit(payload).some(e => e.includes('unknown lineage'))).toBe(true)
  })

  it('rejects negative lifetime stats', () => {
    const payload = {
      ...validPayload,
      stats: {
        ...validPayload.stats,
        lifetime: { ...validPayload.stats.lifetime, total_tokens: -1 },
      },
    }
    expect(validateSubmit(payload).some(e => e.includes('total_tokens'))).toBe(true)
  })

  it('rejects active.current_level out of range', () => {
    const payload = {
      ...validPayload,
      stats: {
        ...validPayload.stats,
        active: { ...validPayload.stats.active, current_level: 101 },
      },
    }
    expect(validateSubmit(payload).some(e => e.includes('current_level'))).toBe(true)
  })

  it('accepts active.lineage = null (no buddy)', () => {
    const payload = {
      ...validPayload,
      stats: { ...validPayload.stats, active: { ...validPayload.stats.active, lineage: null } },
    }
    expect(validateSubmit(payload)).toEqual([])
  })

  it('rejects unknown badge id', () => {
    const payload = {
      ...validPayload,
      stats: { ...validPayload.stats, badges: ['hatch', 'fake_badge'] },
    }
    expect(validateSubmit(payload).some(e => e.includes('fake_badge'))).toBe(true)
  })

  it('accepts all current valid badges', () => {
    const allBadges = [
      'hatch',
      'first_evolution',
      'first_shiny',
      'champion',
      'centurion',
      'constellation',
      'master_pokedex',
      'master_fire',
      'master_water',
      'master_grass',
      'master_electric',
      'master_eevee',
      'master_chikorita',
      'master_cyndaquil',
      'master_totodile',
    ]
    const payload = { ...validPayload, stats: { ...validPayload.stats, badges: allBadges } }
    expect(validateSubmit(payload)).toEqual([])
  })
})
