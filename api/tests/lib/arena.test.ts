import { describe, it, expect } from 'vitest'
import {
  constantTimeEqual,
  extractBearer,
  generateArenaSecret,
  generateBattleId,
  randomSeed,
  sha256Hex,
} from '../../src/lib/arena'

describe('generateArenaSecret', () => {
  it('returns 32 lowercase hex chars', () => {
    const s = generateArenaSecret()
    expect(s).toMatch(/^[a-f0-9]{32}$/)
  })

  it('produces unique secrets across calls', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(generateArenaSecret())
    expect(seen.size).toBe(100)
  })
})

describe('generateBattleId', () => {
  it('returns 32 lowercase hex chars', () => {
    expect(generateBattleId()).toMatch(/^[a-f0-9]{32}$/)
  })

  it('produces unique IDs', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) seen.add(generateBattleId())
    expect(seen.size).toBe(100)
  })
})

describe('randomSeed', () => {
  it('returns a uint32', () => {
    const s = randomSeed()
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(2 ** 32)
  })
})

describe('sha256Hex', () => {
  it('matches the known SHA-256 of the empty string', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  it('is stable for the same input', async () => {
    const a = await sha256Hex('hello-world')
    const b = await sha256Hex('hello-world')
    expect(a).toBe(b)
  })

  it('differs across inputs', async () => {
    expect(await sha256Hex('a')).not.toBe(await sha256Hex('b'))
  })
})

describe('constantTimeEqual', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
  })

  it('returns false for different strings of same length', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
  })

  it('returns false for different lengths (no leak)', () => {
    expect(constantTimeEqual('abc', 'abcd')).toBe(false)
    expect(constantTimeEqual('', 'a')).toBe(false)
  })
})

describe('extractBearer', () => {
  function req(authHeader?: string): Request {
    const headers = new Headers()
    if (authHeader) headers.set('authorization', authHeader)
    return new Request('https://example.com/x', { headers })
  }

  it('extracts a valid Bearer token', () => {
    expect(extractBearer(req('Bearer ' + 'a'.repeat(32)))).toBe('a'.repeat(32))
  })

  it('lowercases the token', () => {
    expect(extractBearer(req('Bearer ' + 'A'.repeat(32)))).toBe('a'.repeat(32))
  })

  it('returns null when header is absent', () => {
    expect(extractBearer(req())).toBeNull()
  })

  it('returns null for malformed header', () => {
    expect(extractBearer(req('NotBearer xyz'))).toBeNull()
    expect(extractBearer(req('Bearer too-short'))).toBeNull()
    expect(extractBearer(req('Bearer ' + 'g'.repeat(32)))).toBeNull() // non-hex
  })

  it('accepts case-insensitive scheme', () => {
    expect(extractBearer(req('bearer ' + 'a'.repeat(32)))).toBe('a'.repeat(32))
    expect(extractBearer(req('BEARER ' + 'a'.repeat(32)))).toBe('a'.repeat(32))
  })
})
