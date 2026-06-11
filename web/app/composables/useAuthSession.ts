// Web GitHub-OAuth session (R2c). Distinct from useArenaSession (the legacy
// anon_id/arena_secret pairing) — R2f will reconcile the two into one identity.
//
// localStorage entry : { session_token, user }. The opaque token is the Bearer
// for /v1/auth/* and is revocable server-side. Same XSS threat model as
// useArenaSession (no v-html ; strict CSP recommended at deploy).

import {
  buildGithubAuthorizeUrl,
  parseStoredAuth,
  randomOauthState,
  SESSION_TOKEN_RE,
  type AuthUser,
  type StoredAuth,
} from '~/utils/auth'

const STORAGE_KEY = 'arena-auth-v1'
const OAUTH_STATE_KEY = 'gh-oauth-state'

// Module-level ref so all consumers share reactive state. Hydration is deferred
// to first call on the client to avoid SSR mismatch.
const auth = ref<StoredAuth | null>(null)
let initialized = false

export function useAuthSession() {
  if (!initialized && typeof localStorage !== 'undefined') {
    auth.value = parseStoredAuth(localStorage.getItem(STORAGE_KEY))
    initialized = true
  }

  const config = useRuntimeConfig()
  const api = useApi()

  const user = computed<AuthUser | null>(() => auth.value?.user ?? null)
  const isAuthenticated = computed(() => auth.value !== null)

  function callbackUrl(): string {
    return `${window.location.origin}/auth/github/callback`
  }

  function persist(s: StoredAuth): void {
    auth.value = s
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch {
      console.warn('[auth] localStorage write failed ; session is in-memory only')
    }
  }

  function signOut(): void {
    // Best-effort server-side revocation (idempotent) before clearing locally.
    const token = auth.value?.session_token
    if (token) void api.authLogout(token).catch(() => {})
    auth.value = null
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }

  /** Kick off the GitHub OAuth redirect (CSRF state stashed in sessionStorage). */
  function signInWithGitHub(): void {
    const state = randomOauthState()
    sessionStorage.setItem(OAUTH_STATE_KEY, state)
    window.location.href = buildGithubAuthorizeUrl({
      clientId: config.public.githubClientId as string,
      redirectUri: callbackUrl(),
      state,
    })
  }

  /** Called by /auth/github/callback : verify state, exchange the code, persist. */
  async function completeGithubCallback(code: string, state: string): Promise<void> {
    const expected = sessionStorage.getItem(OAUTH_STATE_KEY)
    sessionStorage.removeItem(OAUTH_STATE_KEY)
    if (!expected || expected !== state) throw new Error('state_mismatch')
    const res = await api.githubExchange({ code, redirectUri: callbackUrl() })
    if (!SESSION_TOKEN_RE.test(res.session_token)) throw new Error('bad_response')
    persist({
      session_token: res.session_token,
      user: {
        user_id: res.user_id,
        github: res.github,
        email: null,
        display_name: null,
        linked_anon_ids: [],
      },
    })
  }

  /** Re-validate the stored session against the Worker + refresh the user. */
  async function refresh(): Promise<void> {
    if (!auth.value) return
    try {
      const s = await api.authSession(auth.value.session_token)
      persist({
        session_token: auth.value.session_token,
        user: {
          user_id: s.user_id,
          github: s.github,
          email: s.email,
          display_name: s.display_name,
          linked_anon_ids: s.linked_anon_ids,
        },
      })
    } catch {
      signOut() // 401 → token dead/revoked
    }
  }

  return { user, isAuthenticated, signInWithGitHub, completeGithubCallback, refresh, signOut }
}
