// runLogin device-flow poll loop + runLogout (Phase R3d-4b). The bash bats can
// only reach the offline guards (the real flow needs GitHub + a human), so the
// poll loop, slow_down handling, timeout, abort, and session exchange are
// covered here with a mocked fetch + injected sleep/now.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { runLogin, runLogout } from '../src/auth.js'

afterEach(() => vi.unstubAllGlobals())

// A fetch stub that answers per-URL; the GitHub token URL pulls from a queue so
// successive polls return successive bodies.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubFetch(map: { device?: any; tokenQueue?: any[]; session?: any }) {
  const queue = [...(map.tokenQueue ?? [])]
  const fn = vi.fn(async (url: string) => {
    let body: unknown = {}
    if (url.includes('/login/device/code')) body = map.device ?? {}
    else if (url.includes('/login/oauth/access_token')) body = queue.shift() ?? {}
    else if (url.includes('/cli-session')) body = map.session ?? {}
    return { json: async () => body }
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

// A clock that `sleep` advances, so the 300s deadline is controllable.
function clock(startEpoch = 1000, stepPerSleep = 1) {
  let t = startEpoch
  return {
    now: () => t,
    sleep: async (s: number) => {
      t += stepPerSleep || s
    },
  }
}

function harness(stepPerSleep = 1) {
  const out: string[] = []
  const c = clock(1000, stepPerSleep)
  return { deps: { write: (s: string) => out.push(s), sleep: c.sleep, now: c.now }, out }
}

describe('runLogin', () => {
  it('aborts with no endpoint (no network)', async () => {
    const fn = stubFetch({})
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: '', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBeNull()
    expect(out.join('')).toContain('No API endpoint configured')
    expect(fn).not.toHaveBeenCalled()
  })

  it('reports a failed device-code request', async () => {
    stubFetch({ device: {} })
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBeNull()
    expect(out.join('')).toContain('GitHub device-flow request failed')
  })

  it('polls past authorization_pending then exchanges for a session token', async () => {
    stubFetch({
      device: {
        device_code: 'dc',
        user_code: 'WXYZ-1234',
        verification_uri: 'https://gh/device',
        interval: 1,
      },
      tokenQueue: [{ error: 'authorization_pending' }, { access_token: 'gho_abc' }],
      session: { session_token: 'sess_123', github: { login: 'octocat' } },
    })
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBe('sess_123')
    const text = out.join('')
    expect(text).toContain('Open https://gh/device')
    expect(text).toContain('WXYZ-1234')
    expect(text).toContain('✓ Logged in as @octocat')
  })

  it('handles slow_down then succeeds', async () => {
    stubFetch({
      device: { device_code: 'dc', user_code: 'X', verification_uri: 'u', interval: 1 },
      tokenQueue: [{ error: 'slow_down' }, { access_token: 'gho' }],
      session: { session_token: 'sess', github: { login: 'me' } },
    })
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBe('sess')
    expect(out.join('')).toContain('✓ Logged in as @me')
  })

  it('aborts on an unexpected error', async () => {
    stubFetch({
      device: { device_code: 'dc', user_code: 'X', verification_uri: 'u', interval: 1 },
      tokenQueue: [{ error: 'access_denied' }],
    })
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBeNull()
    expect(out.join('')).toContain('Login aborted (access_denied)')
  })

  it('times out when the deadline passes with no token', async () => {
    stubFetch({
      device: { device_code: 'dc', user_code: 'X', verification_uri: 'u', interval: 1 },
      tokenQueue: [{ error: 'authorization_pending' }],
    })
    // each sleep jumps 400s → deadline (now+300) is passed after the first poll.
    const { deps, out } = harness(400)
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBeNull()
    expect(out.join('')).toContain('Timed out waiting for authorization')
  })

  it('reports a failed session exchange', async () => {
    stubFetch({
      device: { device_code: 'dc', user_code: 'X', verification_uri: 'u', interval: 1 },
      tokenQueue: [{ access_token: 'gho' }],
      session: {},
    })
    const { deps, out } = harness()
    const r = await runLogin({ endpoint: 'https://api', clientId: 'cid' }, deps)
    expect(r.sessionToken).toBeNull()
    expect(out.join('')).toContain('Session exchange with the arena failed')
  })
})

describe('runLogout', () => {
  it('is a no-op when not logged in', async () => {
    const fn = stubFetch({})
    const r = await runLogout({ endpoint: 'https://api', token: '' })
    expect(r.session).toBeNull()
    expect(r.output).toContain('Not logged in')
    expect(fn).not.toHaveBeenCalled()
  })

  it('revokes server-side then signals a clear', async () => {
    const fn = stubFetch({})
    const r = await runLogout({ endpoint: 'https://api', token: 'sek' })
    expect(r.session).toEqual({ action: 'clear' })
    expect(r.output).toContain('✓ Logged out')
    expect(fn).toHaveBeenCalledOnce()
    const [url, init] = fn.mock.calls[0]
    expect(url).toContain('/v1/auth/logout')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((init as any).headers.authorization).toBe('Bearer sek')
  })

  it('clears locally without an endpoint (no network)', async () => {
    const fn = stubFetch({})
    const r = await runLogout({ endpoint: '', token: 'sek' })
    expect(r.session).toEqual({ action: 'clear' })
    expect(fn).not.toHaveBeenCalled()
  })
})
