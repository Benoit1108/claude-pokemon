// Top-up auth.ts: the formPost / jsonPost {} fallback when httpJson reports a
// non-ok result (network/parse), and coerceInterval's non-digit / <1 arms
// (exercised via the device-code interval). auth.test.ts covers the happy flow.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runLogin } from '../src/auth.js'

afterEach(() => vi.unstubAllGlobals())

function harness(stepPerSleep = 1) {
  const out: string[] = []
  let t = 1000
  return {
    deps: {
      write: (s: string) => out.push(s),
      sleep: async (s: number) => {
        t += stepPerSleep || s
      },
      now: () => t,
    },
    out,
  }
}

describe('formPost / jsonPost failure fallback', () => {
  it('a network failure on the device-code call yields {} → request-failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))),
    )
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBeNull()
    expect(out.join('')).toContain('GitHub device-flow request failed')
  })

  it('a non-JSON session response yields {} → session exchange failed', async () => {
    let call = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        call++
        if (url.includes('/login/device/code'))
          return new Response(
            JSON.stringify({
              device_code: 'dc',
              user_code: 'X',
              verification_uri: 'u',
              interval: 'oops',
            }),
            { status: 200 },
          )
        if (url.includes('/login/oauth/access_token'))
          return new Response(JSON.stringify({ access_token: 'gho' }), { status: 200 })
        // cli-session → non-JSON body → httpJson parse failure → {} fallback
        return new Response('<html>500</html>', { status: 502 })
      }),
    )
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBeNull()
    expect(out.join('')).toContain('Session exchange with the arena failed')
    expect(call).toBeGreaterThanOrEqual(3)
  })

  it('coerceInterval: a sub-1 numeric interval is floored to the 5s default path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/login/device/code'))
          return new Response(
            JSON.stringify({
              device_code: 'dc',
              user_code: 'X',
              verification_uri: 'u',
              interval: 0,
            }),
            { status: 200 },
          )
        if (url.includes('/login/oauth/access_token'))
          return new Response(JSON.stringify({ access_token: 'gho' }), { status: 200 })
        return new Response(JSON.stringify({ session_token: 'sess', github: { login: 'me' } }), {
          status: 200,
        })
      }),
    )
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBe('sess')
    expect(out.join('')).toContain('Logged in as @me')
  })
})
