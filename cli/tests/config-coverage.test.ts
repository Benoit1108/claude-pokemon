// Coverage-driving tests for the trainer-profile config commands (quote / bio /
// pins). runConfig is pure: (cmd, args, data, state, locale) → { data, output,
// changed }. Asserts on the mutated stats_share fields and the `changed` flag.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runConfig } from '../src/config.js'
import type { PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8')) as Record<
  string,
  unknown
>
const baseData = JSON.parse(
  readFileSync(join(root, 'lib', 'data.default.json'), 'utf8'),
) as PokemonData
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

function cfg(
  cmd: 'quote' | 'bio' | 'pins',
  args: string[],
  share: PokemonData['stats_share'] = {},
  state: PokemonState = {},
) {
  const data: PokemonData = { ...baseData, stats_share: share }
  return runConfig({ cmd, args, data, state, locale: en } as never)
}

describe('runConfig: quote', () => {
  it('shows the current quote when set (no action)', () => {
    const r = cfg('quote', [], { quote: 'Gotta go fast' })
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('Gotta go fast')
  })

  it('shows the unset placeholder when empty (no action)', () => {
    const r = cfg('quote', [], {})
    expect(r.changed).toBe(false)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })

  it('clears the quote', () => {
    const r = cfg('quote', ['clear'], { quote: 'old' })
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.quote).toBeNull()
  })

  it('sets a valid quote', () => {
    const r = cfg('quote', ['Catch', 'em', 'all'])
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.quote).toBe('Catch em all')
  })

  it('rejects a quote longer than 80 chars', () => {
    const r = cfg('quote', ['x'.repeat(81)])
    expect(r.changed).toBe(false)
    expect(r.data.stats_share?.quote).toBeUndefined()
  })

  it('rejects a quote containing a newline', () => {
    const r = cfg('quote', ['line1\nline2'])
    expect(r.changed).toBe(false)
  })
})

describe('runConfig: bio', () => {
  it('shows a multi-line bio when set (no action)', () => {
    const r = cfg('bio', [], { bio: 'line one\nline two' })
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('line one')
    expect(strip(r.output)).toContain('line two')
  })

  it('shows the unset placeholder when empty (no action)', () => {
    const r = cfg('bio', [], {})
    expect(r.changed).toBe(false)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })

  it('clears the bio', () => {
    const r = cfg('bio', ['reset'], { bio: 'old' })
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.bio).toBeNull()
  })

  it('sets a valid multi-line bio (args joined by newlines)', () => {
    const r = cfg('bio', ['first', 'second'])
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.bio).toBe('first\nsecond')
  })

  it('rejects a bio longer than 160 chars', () => {
    const r = cfg('bio', ['x'.repeat(161)])
    expect(r.changed).toBe(false)
  })

  it('rejects a bio with more than 4 lines', () => {
    const r = cfg('bio', ['a', 'b', 'c', 'd', 'e'])
    expect(r.changed).toBe(false)
  })
})

describe('runConfig: pins', () => {
  const stateWithBadges: PokemonState = {
    badges: [
      { id: 'badge-a', earned_at: '2026-01-01T00:00:00Z' },
      { id: 'badge-b', earned_at: '2026-01-02T00:00:00Z' },
    ],
  }

  it('shows current pins when set (no action)', () => {
    const r = cfg(
      'pins',
      [],
      { pinned_badges: ['badge-a'] } as PokemonData['stats_share'],
      stateWithBadges,
    )
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('badge-a')
  })

  it('shows the unset placeholder and owned list when empty', () => {
    const r = cfg('pins', [], {}, stateWithBadges)
    expect(r.changed).toBe(false)
    expect(strip(r.output)).toContain('badge-a')
  })

  it('clears pins', () => {
    const r = cfg(
      'pins',
      ['clear'],
      { pinned_badges: ['badge-a'] } as PokemonData['stats_share'],
      stateWithBadges,
    )
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.pinned_badges).toEqual([])
  })

  it('reports an empty set request', () => {
    const r = cfg('pins', ['set'], {}, stateWithBadges)
    expect(r.changed).toBe(false)
  })

  it('rejects more than 3 pins', () => {
    const r = cfg('pins', ['set', 'badge-a badge-b badge-c badge-d'], {}, stateWithBadges)
    expect(r.changed).toBe(false)
  })

  it('rejects a pin the trainer does not own', () => {
    const r = cfg('pins', ['set', 'badge-x'], {}, stateWithBadges)
    expect(r.changed).toBe(false)
  })

  it('sets valid owned pins (comma-separated parsed)', () => {
    const r = cfg('pins', ['set', 'badge-a,badge-b'], {}, stateWithBadges)
    expect(r.changed).toBe(true)
    expect(r.data.stats_share?.pinned_badges).toEqual(['badge-a', 'badge-b'])
  })

  it('shows usage for an unknown pins action', () => {
    const r = cfg('pins', ['wat'], {}, stateWithBadges)
    expect(r.changed).toBe(false)
  })
})
