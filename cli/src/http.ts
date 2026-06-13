// Unified HTTP plumbing for the CLI (audit cleanup). Replaces the six divergent
// fetch wrappers (arena/live/auth/entry each had their own, with subtly
// different error semantics: null vs {} vs marker objects — a DNS failure, a
// timeout, a 500 and malformed JSON were indistinguishable, and failure
// messages printed "{}" as their entire diagnostic).
//
// One discriminated result, real failure descriptions, an opt-in debug trace
// (POKEMON_DEBUG=1 → stderr), and a sanitizer for SERVER-controlled strings
// before they reach the terminal (ANSI/OSC escape injection defense — names
// are charset-validated server-side, but raw error bodies are not).

export type HttpResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; kind: 'network' | 'parse'; status?: number; detail: string }

const DEBUG = process.env.POKEMON_DEBUG === '1'

export function debugLog(...parts: unknown[]): void {
  if (DEBUG) process.stderr.write(`[pokemon] ${parts.map(p => String(p)).join(' ')}\n`)
}

/**
 * fetch → parsed JSON with discriminated failures. NOTE: a non-2xx HTTP status
 * is returned as ok:true with that status — several worker endpoints speak
 * JSON on errors (e.g. submit 429 carries cooldown_remaining_s), so the caller
 * decides what a given status means. `kind:'network'` = no response at all;
 * `kind:'parse'` = a response that wasn't JSON.
 */
export async function httpJson(
  url: string,
  init?: RequestInit,
  timeoutMs = 10_000,
): Promise<HttpResult> {
  const method = init?.method ?? 'GET'
  let resp: Response
  try {
    resp = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    debugLog(method, url, '→ network error:', detail)
    return { ok: false, kind: 'network', detail }
  }
  try {
    const body: unknown = await resp.json()
    debugLog(method, url, '→', resp.status)
    return { ok: true, status: resp.status, body }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    debugLog(method, url, '→', resp.status, 'unparseable body:', detail)
    return { ok: false, kind: 'parse', status: resp.status, detail }
  }
}

/** Compact human description of a failure (threaded into *_failed messages). */
export function describeFailure(r: Extract<HttpResult, { ok: false }>): string {
  return r.kind === 'network' ? `network: ${r.detail}` : `http ${r.status ?? '?'}: réponse non-JSON`
}

/**
 * Strip terminal-control characters from a server-controlled string before
 * printing it raw (C0 controls incl. ESC — blocks ANSI/OSC injection like
 * title writes or OSC52 clipboard access; keeps printable text intact).
 */
export function sanitizeForTerminal(s: string): string {
  // C0 controls + DEL + C1 controls (\x80-\x9f, where the 8-bit CSI/OSC
  // introducers live) — a MITM/malicious server can't smuggle ANSI/OSC escapes.
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x1f\x7f-\x9f]/g, '')
}

/** sanitizeForTerminal over a JSON.stringify of an unknown server body. */
export function describeBody(body: unknown): string {
  return sanitizeForTerminal(typeof body === 'string' ? body : (JSON.stringify(body) ?? ''))
}
