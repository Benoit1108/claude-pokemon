import { describe, it, expect } from 'vitest'
import { fmt, fmtPct, rankPrefix, trainerLabel } from '~/utils/format'

describe('fmt', () => {
  it('returns "—" for null/undefined', () => {
    expect(fmt(null)).toBe('—')
    expect(fmt(undefined)).toBe('—')
  })

  it('formats millions with one decimal + M suffix', () => {
    expect(fmt(2_638_000)).toBe('2.6M')
    expect(fmt(1_000_000)).toBe('1.0M')
    expect(fmt(15_500_000)).toBe('15.5M')
  })

  it('formats thousands with no decimal + K suffix', () => {
    expect(fmt(1_000)).toBe('1K')
    expect(fmt(2_500)).toBe('3K')
  })

  it('locale-formats small numbers (fr-FR)', () => {
    expect(fmt(0)).toBe('0')
    expect(fmt(42)).toBe('42')
    // fr-FR uses U+202F (narrow no-break space) as thousand separator
    expect(fmt(999)).toBe('999')
  })
})

describe('fmtPct', () => {
  it('returns "—" for null/undefined', () => {
    expect(fmtPct(null)).toBe('—')
    expect(fmtPct(undefined)).toBe('—')
  })

  it('formats ratio as percentage with 2 decimals', () => {
    expect(fmtPct(0)).toBe('0.00%')
    expect(fmtPct(0.5)).toBe('50.00%')
    expect(fmtPct(0.0833)).toBe('8.33%')
    expect(fmtPct(1)).toBe('100.00%')
  })

  it('handles tiny ratios', () => {
    expect(fmtPct(0.0001)).toBe('0.01%')
  })
})

describe('rankPrefix', () => {
  it('returns trophy emoji for top 3', () => {
    expect(rankPrefix(1)).toBe('🥇')
    expect(rankPrefix(2)).toBe('🥈')
    expect(rankPrefix(3)).toBe('🥉')
  })

  it('returns padded "N." for ranks 4+', () => {
    expect(rankPrefix(4)).toBe(' 4.')
    expect(rankPrefix(10)).toBe('10.')
    expect(rankPrefix(99)).toBe('99.')
  })
})

describe('trainerLabel', () => {
  it('returns pseudo#shortid when display_name set', () => {
    expect(trainerLabel({ display_name: 'benoit1108', anon_id: 'c5bbdea6' })).toBe(
      'benoit1108#c5bb',
    )
  })

  it('returns full anon_id when display_name is null', () => {
    expect(trainerLabel({ display_name: null, anon_id: 'c5bbdea6' })).toBe('c5bbdea6')
  })

  it('returns full anon_id when display_name is empty', () => {
    expect(trainerLabel({ display_name: '', anon_id: 'c5bbdea6' })).toBe('c5bbdea6')
  })
})
