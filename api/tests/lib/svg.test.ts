import { describe, it, expect } from 'vitest'
import { escapeXml, fmtTokens, svgBadge, svgPlaceholder } from '../../src/lib/svg'
import type { KVRecord } from '../../src/types'

describe('escapeXml', () => {
  it('escapes special chars', () => {
    expect(escapeXml('<script>')).toBe('&lt;script&gt;')
    expect(escapeXml('a & b')).toBe('a &amp; b')
    expect(escapeXml('"quoted"')).toBe('&quot;quoted&quot;')
    expect(escapeXml("it's")).toBe('it&apos;s')
  })

  it('passes through safe strings', () => {
    expect(escapeXml('benoit1108')).toBe('benoit1108')
    expect(escapeXml('123')).toBe('123')
  })

  it('handles non-strings gracefully', () => {
    expect(escapeXml(42)).toBe('42')
    expect(escapeXml(null)).toBe('null')
    expect(escapeXml(undefined)).toBe('undefined')
  })
})

describe('fmtTokens', () => {
  it('formats millions with one decimal', () => {
    expect(fmtTokens(2_638_000)).toBe('2.6M')
    expect(fmtTokens(1_000_000)).toBe('1.0M')
    expect(fmtTokens(15_500_000)).toBe('15.5M')
  })

  it('formats thousands with no decimal', () => {
    expect(fmtTokens(2_500)).toBe('3K')
    expect(fmtTokens(1_000)).toBe('1K')
    expect(fmtTokens(999_900)).toBe('1000K')
  })

  it('passes through small numbers', () => {
    expect(fmtTokens(0)).toBe('0')
    expect(fmtTokens(42)).toBe('42')
    expect(fmtTokens(999)).toBe('999')
  })
})

const baseRecord: KVRecord = {
  anon_id: 'c5bbdea6',
  display_name: 'benoit1108',
  quote: null,
  bio: null,
  pinned_badges: [],
  origin: 'cli',
  schema_version: 1,
  client_version: '1.0.0',
  submitted_at: '2026-05-06T10:00:00Z',
  stats: {
    lifetime: {
      total_tokens: 2_638_000,
      total_evolutions: 3,
      total_shinies: 1,
      max_level: 45,
      total_compagnons: 3,
      lineages_completed: [],
      games_won: 1,
      games_played: 2,
    },
    active: { lineage: 'fire', current_level: 0, is_shiny: false },
    badges: ['hatch', 'first_evolution', 'first_shiny', 'master_pokedex'],
    pokedex_seen_count: 5,
  },
}

describe('svgBadge', () => {
  it('produces well-formed SVG with width 480 height 100', () => {
    const svg = svgBadge(baseRecord)
    expect(svg).toMatch(/^<svg /)
    expect(svg).toContain('width="480"')
    expect(svg).toContain('height="100"')
    expect(svg).toContain('</svg>')
  })

  it('renders pseudo with shortid when display_name set', () => {
    const svg = svgBadge(baseRecord)
    expect(svg).toContain('benoit1108#c5bb')
  })

  it('renders raw anon_id when display_name is null', () => {
    const svg = svgBadge({ ...baseRecord, display_name: null })
    expect(svg).toContain('c5bbdea6')
    expect(svg).not.toContain('#c5bb')
  })

  it('uses lineage emoji + accent color', () => {
    const svg = svgBadge(baseRecord)
    expect(svg).toContain('🔥')
    expect(svg).toContain('Feu')
    expect(svg).toContain('#ef6c00')
  })

  it('shows shiny mark when is_shiny=true', () => {
    const svg = svgBadge({
      ...baseRecord,
      stats: { ...baseRecord.stats, active: { ...baseRecord.stats.active, is_shiny: true } },
    })
    expect(svg).toContain('✦')
  })

  it('no shiny mark when is_shiny=false', () => {
    const svg = svgBadge(baseRecord)
    expect(svg).not.toContain('✦')
  })

  it('includes formatted token count + pokédex + badges/15', () => {
    const svg = svgBadge(baseRecord)
    expect(svg).toContain('2.6M')
    expect(svg).toContain('📖 5/251')
    expect(svg).toContain('🏆 4/15')
  })

  it('shows ⚔️ arena indicator when arenaEnabled=true', () => {
    const svg = svgBadge(baseRecord, { arenaEnabled: true })
    expect(svg).toContain('⚔️')
  })

  it('omits ⚔️ arena indicator when arenaEnabled=false (default)', () => {
    const svg = svgBadge(baseRecord)
    expect(svg).not.toContain('⚔️')
    const svg2 = svgBadge(baseRecord, { arenaEnabled: false })
    expect(svg2).not.toContain('⚔️')
  })

  it('renders pokédex count from stats.pokedex_seen_count', () => {
    const svg = svgBadge({
      ...baseRecord,
      stats: { ...baseRecord.stats, pokedex_seen_count: 127 },
    })
    expect(svg).toContain('📖 127/251')
  })

  it('falls back to fire styling if active.lineage is null', () => {
    const svg = svgBadge({
      ...baseRecord,
      stats: { ...baseRecord.stats, active: { ...baseRecord.stats.active, lineage: null } },
    })
    // Falls back to fire (default in svgBadge)
    expect(svg).toContain('🔥')
  })

  it('escapes display_name to prevent XML injection', () => {
    const svg = svgBadge({ ...baseRecord, display_name: '<script>alert("x")</script>' })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
  })
})

describe('svgPlaceholder', () => {
  it('renders message in placeholder SVG', () => {
    const svg = svgPlaceholder('trainer not found')
    expect(svg).toMatch(/^<svg /)
    expect(svg).toContain('trainer not found')
    expect(svg).toContain('width="480"')
  })

  it('escapes special chars in message', () => {
    const svg = svgPlaceholder('<bad>')
    expect(svg).not.toContain('<bad>')
    expect(svg).toContain('&lt;bad&gt;')
  })
})
