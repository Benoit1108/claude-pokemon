// Strict whitelist validation for the submit payload.
// Pure function — easy to unit-test (no IO).

import {
  ANON_ID_RE,
  CLIENT_DECLARABLE_ORIGINS,
  DISPLAY_NAME_RE,
  QUOTE_MAX_LENGTH,
  BIO_MAX_LENGTH,
  PINNED_BADGES_MAX,
  POKEDEX_ID_RE,
  POKEDEX_MAX_IDS,
  SCHEMA_VERSION,
  ALLOWED_LINEAGES,
  ALLOWED_BADGES,
  type BattleParticipant,
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

  // quote : optional, ≤QUOTE_MAX_LENGTH chars, no newlines (single line). The
  // intent is a small trash-talk/flair tag visible on the public profile —
  // not a chat surface.
  if (b.quote !== undefined && b.quote !== null && b.quote !== '') {
    if (typeof b.quote !== 'string') {
      errs.push('quote must be a string')
    } else {
      if (b.quote.length > QUOTE_MAX_LENGTH) {
        errs.push(`quote must be ≤${QUOTE_MAX_LENGTH} chars (got ${b.quote.length})`)
      }
      if (/[\r\n]/.test(b.quote)) {
        errs.push('quote must be a single line (no newlines)')
      }
    }
  }

  // bio : optional, ≤BIO_MAX_LENGTH chars, multi-line allowed but capped at
  // 4 lines (the public TrainerHero only renders ~4 lines worth of space).
  if (b.bio !== undefined && b.bio !== null && b.bio !== '') {
    if (typeof b.bio !== 'string') {
      errs.push('bio must be a string')
    } else {
      if (b.bio.length > BIO_MAX_LENGTH) {
        errs.push(`bio must be ≤${BIO_MAX_LENGTH} chars (got ${b.bio.length})`)
      }
      const lineCount = b.bio.split('\n').length
      if (lineCount > 4) {
        errs.push(`bio must be ≤4 lines (got ${lineCount})`)
      }
    }
  }

  // pinned_badges : optional array of badge keys. Must be ≤PINNED_BADGES_MAX,
  // each must be in the allowed badge set, no duplicates. Empty array is
  // valid and means "no pins".
  if (b.pinned_badges !== undefined && b.pinned_badges !== null) {
    if (!Array.isArray(b.pinned_badges)) {
      errs.push('pinned_badges must be an array')
    } else {
      if (b.pinned_badges.length > PINNED_BADGES_MAX) {
        errs.push(`pinned_badges must be ≤${PINNED_BADGES_MAX} entries`)
      }
      const seen = new Set<string>()
      for (const pin of b.pinned_badges) {
        if (typeof pin !== 'string' || !ALLOWED_BADGES.has(pin)) {
          errs.push(`unknown pinned badge: ${pin}`)
        } else if (seen.has(pin)) {
          errs.push(`duplicate pinned badge: ${pin}`)
        } else {
          seen.add(pin)
        }
      }
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

  // Sprint 4 — optional origin. Reject 'linked' from clients (worker-only).
  if (b.origin !== undefined) {
    if (typeof b.origin !== 'string' || !CLIENT_DECLARABLE_ORIGINS.has(b.origin)) {
      errs.push("origin must be 'cli' or 'web'")
    }
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

  // Sprint 2.11 — pokedex_seen_ids : optional array of species ids. Validated
  // strictly against POKEDEX_ID_RE so a malicious client can't smuggle
  // arbitrary strings through. Capped at POKEDEX_MAX_IDS to bound storage.
  if (s.pokedex_seen_ids !== undefined && s.pokedex_seen_ids !== null) {
    if (!Array.isArray(s.pokedex_seen_ids)) {
      errs.push('stats.pokedex_seen_ids must be an array')
    } else if (s.pokedex_seen_ids.length > POKEDEX_MAX_IDS) {
      errs.push(`stats.pokedex_seen_ids exceeds max length (${POKEDEX_MAX_IDS})`)
    } else {
      for (const id of s.pokedex_seen_ids) {
        if (typeof id !== 'string' || !POKEDEX_ID_RE.test(id)) {
          errs.push(`stats.pokedex_seen_ids: invalid id ${id}`)
          break // one error message is enough — don't spam
        }
      }
    }
  }

  return errs
}

/**
 * Validate a BattleParticipant snapshot (used for arena enable + opponent
 * registration). Strict whitelist on lineage + level bounds.
 */
export function validateTeamSnapshot(body: unknown): string[] {
  const errs: string[] = []
  if (!body || typeof body !== 'object') return ['team_snapshot must be object']
  const p = body as Partial<BattleParticipant>

  if (typeof p.anon_id !== 'string' || !ANON_ID_RE.test(p.anon_id)) {
    errs.push('team_snapshot.anon_id must match /^[a-f0-9]{8,16}$/')
  }
  if (p.display_name !== undefined && p.display_name !== null && p.display_name !== '') {
    if (typeof p.display_name !== 'string' || !DISPLAY_NAME_RE.test(p.display_name)) {
      errs.push('team_snapshot.display_name must match /^[a-zA-Z0-9_-]{2,24}$/')
    }
  }
  if (typeof p.lineage !== 'string' || !ALLOWED_LINEAGES.has(p.lineage)) {
    errs.push(`team_snapshot.lineage must be one of allowed lineages`)
  }
  if (typeof p.level !== 'number' || p.level < 1 || p.level > 100) {
    errs.push('team_snapshot.level must be 1-100')
  }
  if (typeof p.is_shiny !== 'boolean') {
    errs.push('team_snapshot.is_shiny must be boolean')
  }
  return errs
}
