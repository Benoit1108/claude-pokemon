// Unified HTTP plumbing: discriminated results + the terminal sanitizer.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { httpJson, describeFailure, sanitizeForTerminal, describeBody } from '../src/http.js'

afterEach(() => vi.unstubAllGlobals())

describe('httpJson', () => {
  it('returns ok with status + parsed body (incl. non-2xx JSON)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 429, json: async () => ({ cooldown_remaining_s: 7 }) })))
    const r = await httpJson('https://x/v1/submit', { method: 'POST' })
    expect(r).toEqual({ ok: true, status: 429, body: { cooldown_remaining_s: 7 } })
  })
  it('network failure → kind network with the real detail', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1'))))
    const r = await httpJson('https://x/v1/aggregate')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('network')
      expect(describeFailure(r)).toContain('ECONNREFUSED')
    }
  })
  it('non-JSON body → kind parse carrying the HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 502, json: async () => Promise.reject(new SyntaxError('Unexpected token <')) })))
    const r = await httpJson('https://x/v1/leaderboard')
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.kind).toBe('parse')
      expect(r.status).toBe(502)
      expect(describeFailure(r)).toContain('502')
    }
  })
})

describe('sanitizeForTerminal', () => {
  it('strips ESC/OSC injection while keeping printable text', () => {
    expect(sanitizeForTerminal('\x1b]0;pwned\x07ok\x1b[31mred')).toBe(']0;pwnedok[31mred')
    expect(sanitizeForTerminal('Évoli ★ #25')).toBe('Évoli ★ #25')
  })
  it('describeBody stringifies + sanitizes unknown server bodies', () => {
    // Object bodies: JSON.stringify already escapes ESC to the harmless text
    // "" — no raw control byte survives.
    expect(describeBody({ error: 'bad\x1b[2Jthing' })).toBe('{"error":"bad\\u001b[2Jthing"}')
    // String bodies are where raw control bytes could reach the terminal.
    expect(describeBody('bad\x1b[2Jthing')).toBe('bad[2Jthing')
  })
})
