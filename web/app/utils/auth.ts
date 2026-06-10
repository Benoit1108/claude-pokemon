// Pure GitHub-OAuth + session helpers (no Vue/Nuxt deps) — unit-testable. The
// stateful glue (localStorage, redirect, API calls) lives in useAuthSession.

import type { GithubIdentity } from '~/types/api'

/** Opaque session token shape issued by the Worker (24 random bytes hex). */
export const SESSION_TOKEN_RE = /^[a-f0-9]{48}$/
const USER_ID_RE = /^[a-f0-9]{16}$/

export interface AuthUser {
  user_id: string
  github: GithubIdentity | null
  email: { address: string } | null
  display_name: string | null
  linked_anon_ids: string[]
}

export interface StoredAuth {
  session_token: string
  user: AuthUser
}

/** CSRF state for the OAuth round-trip — 16 random bytes hex. */
export function randomOauthState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let s = ''
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

export function buildGithubAuthorizeUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    scope: 'read:user',
    state: opts.state,
  })
  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

/** Validate a localStorage blob before trusting it as a session (reject corrupt
 * / tampered values so authed calls don't break later). */
export function parseStoredAuth(raw: string | null): StoredAuth | null {
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as Partial<StoredAuth>
    if (typeof p.session_token !== 'string' || !SESSION_TOKEN_RE.test(p.session_token)) return null
    const u = p.user
    if (!u || typeof u.user_id !== 'string' || !USER_ID_RE.test(u.user_id)) return null
    return p as StoredAuth
  } catch {
    return null
  }
}
