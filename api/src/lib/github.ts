// GitHub OAuth HTTP wrappers (Phase R2b). Kept thin + side-effecting (just
// fetch) so the handler logic stays testable by stubbing global fetch.

import type { Env } from '../env.d'

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_USER_URL = 'https://api.github.com/user'

export interface GithubUser {
  id: number
  login: string
}

/** Exchange a one-time authorization `code` for a GitHub access token. Requires
 * the configured client_id + client_secret. Throws on any failure. */
export async function exchangeCodeForAccessToken(
  env: Env,
  code: string,
  redirectUri: string,
): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) throw new Error('github_token_exchange_failed')
  const data = (await res.json()) as { access_token?: string; error?: string }
  if (!data.access_token) throw new Error('github_token_exchange_failed')
  return data.access_token
}

/** Fetch the authenticated GitHub user (id + login) for an access token. */
export async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'claude-pokemon-arena',
    },
  })
  if (!res.ok) throw new Error('github_user_fetch_failed')
  const u = (await res.json()) as { id?: number; login?: string }
  if (typeof u.id !== 'number' || typeof u.login !== 'string') {
    throw new Error('github_user_fetch_failed')
  }
  return { id: u.id, login: u.login }
}
