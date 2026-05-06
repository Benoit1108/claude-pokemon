// Strict whitelist validation for the submit payload.
// Pure function — easy to unit-test (no IO).

import {
  ANON_ID_RE,
  DISPLAY_NAME_RE,
  SCHEMA_VERSION,
  ALLOWED_LINEAGES,
  ALLOWED_BADGES,
  type SubmitPayload,
} from '../types'

/**
 * Returns an array of validation errors. Empty array = valid.
 * Strict whitelist : extra fields are silently dropped (handler picks only
 * known fields from the body), but malformed values are rejected.
 */
export function validateSubmit(body: unknown): string[] {
  const errs: string[] = []
  if (!body || typeof body !== 'object') return ['body must be object']

  const b = body as Partial<SubmitPayload>

  if (typeof b.anon_id !== 'string' || !ANON_ID_RE.test(b.anon_id)) {
    errs.push('anon_id must match /^[a-f0-9]{8,16}$/')
  }

  // display_name : optional, but if present must match charset + length
  if (b.display_name !== undefined && b.display_name !== null && b.display_name !== '') {
    if (typeof b.display_name !== 'string' || !DISPLAY_NAME_RE.test(b.display_name)) {
      errs.push('display_name must match /^[a-zA-Z0-9_-]{2,24}$/ (or be null/empty)')
    }
  }

  if (b.schema_version !== SCHEMA_VERSION) {
    errs.push(`schema_version must be ${SCHEMA_VERSION} (got ${b.schema_version})`)
  }
  if (typeof b.client_version !== 'string' || b.client_version.length > 32) {
    errs.push('client_version must be string ≤32 chars')
  }
  if (typeof b.submitted_at !== 'string') {
    errs.push('submitted_at must be ISO timestamp string')
  }

  const s = b.stats
  if (!s || typeof s !== 'object') {
    return errs.concat('stats missing or not object')
  }

  // lifetime block
  const lt = s.lifetime as unknown as Record<string, unknown> | undefined
  if (!lt || typeof lt !== 'object') {
    errs.push('stats.lifetime missing')
  } else {
    for (const k of [
      'total_tokens',
      'total_evolutions',
      'total_shinies',
      'max_level',
      'total_compagnons',
      'games_won',
      'games_played',
    ] as const) {
      const v = lt[k]
      if (typeof v !== 'number' || v < 0 || v > 1e15) {
        errs.push(`stats.lifetime.${k} must be non-negative number`)
      }
    }
    if (!Array.isArray(lt.lineages_completed)) {
      errs.push('stats.lifetime.lineages_completed must be array')
    } else {
      for (const lin of lt.lineages_completed) {
        if (typeof lin !== 'string' || !ALLOWED_LINEAGES.has(lin)) {
          errs.push(`unknown lineage: ${lin}`)
        }
      }
    }
  }

  // active block
  const a = s.active as unknown as Record<string, unknown> | undefined
  if (!a || typeof a !== 'object') {
    errs.push('stats.active missing')
  } else {
    if (a.lineage !== null && (typeof a.lineage !== 'string' || !ALLOWED_LINEAGES.has(a.lineage))) {
      errs.push(`unknown active.lineage: ${a.lineage}`)
    }
    if (typeof a.current_level !== 'number' || a.current_level < 0 || a.current_level > 100) {
      errs.push('active.current_level must be 0-100')
    }
    if (typeof a.is_shiny !== 'boolean') {
      errs.push('active.is_shiny must be boolean')
    }
  }

  // badges
  if (!Array.isArray(s.badges)) {
    errs.push('stats.badges must be array')
  } else {
    for (const bg of s.badges) {
      if (typeof bg !== 'string' || !ALLOWED_BADGES.has(bg)) {
        errs.push(`unknown badge: ${bg}`)
      }
    }
  }

  if (typeof s.pokedex_seen_count !== 'number' || s.pokedex_seen_count < 0) {
    errs.push('stats.pokedex_seen_count must be non-negative number')
  }

  return errs
}
