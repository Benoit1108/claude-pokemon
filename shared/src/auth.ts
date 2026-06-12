// GitHub device-flow login / logout (Phase R3d-4b). Ported verbatim from
// view_login / view_logout (lib/pokemon-status.sh). Strings are hardcoded
// English (the bash never ran these through pokemon_t), so no i18n here.
//
// The engine NEVER writes the `.session` file (same chmod-600 contract as the
// arena_secret): runLogin returns the token for bash to persist, runLogout
// returns a `clear` op. login is interactive (polls GitHub up to 5 min), so the
// engine streams its human-facing text via a `write` callback (→ stderr, which
// bash leaves attached to the terminal) and emits only the session op on stdout.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any

import { httpJson } from './http.js'

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'

// {} on any failure: the device-flow poll loop treats "no body" as
// keep-polling (a transient network blip mustn't abort a 5-minute wait).
// Real failures surface via POKEMON_DEBUG (httpJson traces them).
async function formPost(url: string, params: Record<string, string>, timeoutMs: number): Promise<Json> {
  const r = await httpJson(
    url,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(),
    },
    timeoutMs,
  )
  return r.ok ? (r.body as Json) : {}
}

async function jsonPost(url: string, body: Json, timeoutMs: number, headers: Record<string, string> = {}): Promise<Json> {
  const r = await httpJson(
    url,
    { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) },
    timeoutMs,
  )
  return r.ok ? (r.body as Json) : {}
}

// Mirror of bash's interval coercion: jq `.interval // 5`, then any non-digit
// (incl. a float's `.`) → 5, then < 1 → 5.
function coerceInterval(v: unknown): number {
  const s = String(v ?? 5)
  if (!/^[0-9]+$/.test(s)) return 5
  const n = parseInt(s, 10)
  return n < 1 ? 5 : n
}

export interface LoginInput {
  endpoint: string
  clientId: string
}
export interface LoginDeps {
  /** Human-facing progress — routed to stderr so it streams live to the tty. */
  write: (s: string) => void
  /** Seconds. */
  sleep: (seconds: number) => Promise<void>
  /** Epoch seconds. */
  now: () => number
}

export async function runLogin(input: LoginInput, deps: LoginDeps): Promise<{ sessionToken: string | null }> {
  const { endpoint, clientId } = input
  const { write, sleep, now } = deps
  if (!endpoint) {
    write('  No API endpoint configured (data.json.stats_share.endpoint).\n')
    return { sessionToken: null }
  }

  const dc = await formPost(GITHUB_DEVICE_CODE_URL, { client_id: clientId, scope: 'read:user' }, 10_000)
  const deviceCode: string = dc.device_code ?? ''
  const userCode: string = dc.user_code ?? ''
  const verificationUri: string = dc.verification_uri ?? ''
  let interval = coerceInterval(dc.interval)
  if (!deviceCode) {
    write('  GitHub device-flow request failed (is Device Flow enabled on the OAuth app?).\n')
    return { sessionToken: null }
  }

  write(`\n  Open ${verificationUri}\n  and enter the code:  ${userCode}\n\n  Waiting for authorization…\n`)

  let accessToken = ''
  const deadline = now() + 300
  while (now() < deadline) {
    await sleep(interval)
    const poll = await formPost(
      GITHUB_TOKEN_URL,
      { client_id: clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' },
      10_000,
    )
    accessToken = poll.access_token ?? ''
    if (accessToken) break
    const err: string = poll.error ?? ''
    if (err === 'slow_down') interval += 5
    else if (err === 'authorization_pending' || err === '') {
      // keep polling
    } else {
      write(`  Login aborted (${err}).\n`)
      return { sessionToken: null }
    }
  }
  if (!accessToken) {
    write('  Timed out waiting for authorization.\n')
    return { sessionToken: null }
  }

  const sess = await jsonPost(`${endpoint}/v1/auth/github/cli-session`, { access_token: accessToken }, 10_000)
  const sessionToken: string = sess.session_token ?? ''
  const loginName: string = sess.github?.login ?? ''
  if (!sessionToken) {
    write('  Session exchange with the arena failed.\n')
    return { sessionToken: null }
  }
  write(`  ✓ Logged in as @${loginName}\n`)
  return { sessionToken }
}

export interface LogoutInput {
  endpoint: string
  /** Current `.session` contents ('' if not logged in). */
  token: string
}
export interface LogoutResult {
  output: string
  session: { action: 'clear' } | null
}

export async function runLogout(input: LogoutInput): Promise<LogoutResult> {
  const { endpoint, token } = input
  if (!token) return { output: '  Not logged in.\n', session: null }
  if (endpoint) {
    // Best-effort server-side revocation (bare POST, auth header only);
    // failures only surface via POKEMON_DEBUG.
    await httpJson(`${endpoint}/v1/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } }, 5_000)
  }
  return { output: '  ✓ Logged out.\n', session: { action: 'clear' } }
}
