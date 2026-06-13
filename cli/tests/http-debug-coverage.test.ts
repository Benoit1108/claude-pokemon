// debugLog's DEBUG=1 branch (read at module load) + describeFailure's network
// arm. http.test.ts covers the DEBUG-off path and the parse arm.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'

const orig = process.env.POKEMON_DEBUG

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (orig === undefined) delete process.env.POKEMON_DEBUG
  else process.env.POKEMON_DEBUG = orig
})
beforeEach(() => vi.resetModules())

describe('debugLog with POKEMON_DEBUG=1', () => {
  it('writes a trace to stderr on success and on network failure', async () => {
    process.env.POKEMON_DEBUG = '1'
    const writes: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((s: string | Uint8Array) => {
      writes.push(String(s))
      return true
    })
    const http = await import('../src/http.js')
    http.debugLog('hello', 42)
    expect(writes.join('')).toContain('[pokemon] hello 42')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"ok":1}', { status: 200 })),
    )
    await http.httpJson('https://x/v1/ok')
    expect(writes.join('')).toContain('200')

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('boom'))),
    )
    const r = await http.httpJson('https://x/v1/fail')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(http.describeFailure(r)).toContain('network: boom')
    expect(writes.join('')).toContain('network error')
    spy.mockRestore()
  })

  it('debugLog is a no-op when DEBUG is off', async () => {
    delete process.env.POKEMON_DEBUG
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const http = await import('../src/http.js')
    http.debugLog('quiet')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('describeFailure formats an unknown-status parse failure', async () => {
    const http = await import('../src/http.js')
    expect(http.describeFailure({ ok: false, kind: 'parse', detail: 'x' })).toContain('http ?')
  })
})
