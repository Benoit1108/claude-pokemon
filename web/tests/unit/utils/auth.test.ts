// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import {
  buildGithubAuthorizeUrl,
  parseStoredAuth,
  randomOauthState,
  SESSION_TOKEN_RE,
} from '~/utils/auth'

const VALID_TOKEN = 'a'.repeat(48)
const VALID_USER = {
  user_id: '0123456789abcdef',
  github: null,
  email: null,
  display_name: null,
  linked_anon_ids: [],
}

describe('randomOauthState', () => {
  it('is 32 hex chars and unique', () => {
    const a = randomOauthState()
    expect(a).toMatch(/^[a-f0-9]{32}$/)
    expect(a).not.toBe(randomOauthState())
  })
})

describe('buildGithubAuthorizeUrl', () => {
  it('builds the authorize URL with encoded params', () => {
    const url = buildGithubAuthorizeUrl({
      clientId: 'cid',
      redirectUri: 'http://localhost:3000/auth/github/callback',
      state: 'st4te',
    })
    expect(url.startsWith('https://github.com/login/oauth/authorize?')).toBe(true)
    const q = new URL(url).searchParams
    expect(q.get('client_id')).toBe('cid')
    expect(q.get('redirect_uri')).toBe('http://localhost:3000/auth/github/callback')
    expect(q.get('scope')).toBe('read:user')
    expect(q.get('state')).toBe('st4te')
  })
})

describe('parseStoredAuth', () => {
  it('accepts a well-formed blob', () => {
    const raw = JSON.stringify({ session_token: VALID_TOKEN, user: VALID_USER })
    expect(parseStoredAuth(raw)).toEqual({ session_token: VALID_TOKEN, user: VALID_USER })
  })

  it('rejects null / garbage / bad token / bad user', () => {
    expect(parseStoredAuth(null)).toBeNull()
    expect(parseStoredAuth('not json')).toBeNull()
    expect(parseStoredAuth(JSON.stringify({ session_token: 'short', user: VALID_USER }))).toBeNull()
    expect(
      parseStoredAuth(JSON.stringify({ session_token: VALID_TOKEN, user: { user_id: 'nope' } })),
    ).toBeNull()
    expect(parseStoredAuth(JSON.stringify({ session_token: VALID_TOKEN }))).toBeNull()
  })

  it('SESSION_TOKEN_RE matches a 48-hex token', () => {
    expect(SESSION_TOKEN_RE.test(VALID_TOKEN)).toBe(true)
    expect(SESSION_TOKEN_RE.test('xyz')).toBe(false)
  })
})
