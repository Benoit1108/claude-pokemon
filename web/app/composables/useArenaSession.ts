// Tracks whether this browser is paired with a CLI install (Sprint 2.12).
// Pairing is set by /pair after a successful redeem, cleared via clear().
// localStorage entry shape : { anon_id, arena_secret, paired_at: ISO string }.
//
// All consumers should treat the secret as confidential — it's used as the
// Bearer token for /v1/arena/* mutating endpoints.
//
// Threat model (Sprint 2.13 — Q9) : the arena_secret lives in localStorage,
// which means any XSS payload running on this origin can read it and
// impersonate the trainer. We mitigate by (a) keeping the secret rotation
// path one-click via /pokemon arena regenerate on the CLI, (b) avoiding any
// v-html / non-trusted HTML rendering in the codebase, and (c) recommending
// a strict CSP at deploy time. This is acceptable for our threat surface
// (no money, no PII) but worth re-evaluating if the model shifts.

const STORAGE_KEY = 'arena-session-v1'

// Sprint 2.13 (Q5) — match the worker's ANON_ID_RE so a corrupt response
// from a future Worker version can't poison localStorage with garbage.
const ANON_ID_RE = /^[a-f0-9]{8,16}$/
// Tight bound on secret shape : 32–64 hex chars. Worker enforces this on
// generation ; we mirror to reject obvious corruption.
const ARENA_SECRET_RE = /^[a-f0-9]{32,64}$/

export interface ArenaSession {
  anon_id: string
  arena_secret: string
  paired_at: string
}

function isValidSession(s: Partial<ArenaSession>): s is ArenaSession {
  return (
    typeof s.anon_id === 'string' &&
    ANON_ID_RE.test(s.anon_id) &&
    typeof s.arena_secret === 'string' &&
    ARENA_SECRET_RE.test(s.arena_secret) &&
    typeof s.paired_at === 'string'
  )
}

function readStorage(): ArenaSession | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ArenaSession>
    return isValidSession(parsed) ? parsed : null
  } catch {
    return null
  }
}

// Module-level ref so all consumers share the same reactive state across the
// page. Initial read is deferred to onMounted to avoid SSR mismatch.
const session = ref<ArenaSession | null>(null)
let initialized = false

export function useArenaSession() {
  if (!initialized && typeof localStorage !== 'undefined') {
    session.value = readStorage()
    initialized = true
  }

  function set(s: ArenaSession): boolean {
    // Sprint 2.13 (Q5) — refuse to persist a malformed session. Returns
    // false so the caller can surface an error to the user instead of
    // silently storing garbage that breaks every authed call later.
    if (!isValidSession(s)) return false
    session.value = s
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
      } catch {
        // Quota / disabled — keep in-memory state and warn the dev console
        // so the user notices their session won't survive a refresh.
        console.warn('[arena-session] localStorage write failed ; session is in-memory only')
      }
    }
    return true
  }

  function clear(): void {
    session.value = null
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* ignore */
      }
    }
  }

  const isPaired = computed(() => session.value !== null)

  return {
    session,
    isPaired,
    set,
    clear,
  }
}
