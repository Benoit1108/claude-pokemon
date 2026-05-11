// PATCH /v1/trainer/<anon_id>/profile — Bearer auth.
// Sprint 3.6 — partial update of the trainer's *profile* fields
// (display_name, quote, bio, pinned_badges). Stats are untouched ;
// they're owned by the periodic /v1/submit from the CLI (or by Sprint 4
// server-side endpoints for web-native progression).
//
// Body : { display_name?, quote?, bio?, pinned_badges? } — every field
// optional, only present ones are written. To clear a field, pass `null`
// (e.g. {"bio": null} resets it). pinned_badges is intersected with the
// trainer's owned badges as defense in depth.

import type { Env } from '../env.d'
import { jsonResp } from '../lib/http'
import { constantTimeEqual, extractBearer, sha256Hex } from '../lib/arena'
import { getArena, getStats, putStats } from '../lib/kv'
import { bootstrapStatsFromArena } from '../lib/trainer-bootstrap'
import {
  ANON_ID_RE,
  BIO_MAX_LENGTH,
  DISPLAY_NAME_RE,
  PINNED_BADGES_MAX,
  QUOTE_MAX_LENGTH,
  ALLOWED_BADGES,
} from '../types'

interface PatchBody {
  display_name?: string | null
  quote?: string | null
  bio?: string | null
  pinned_badges?: string[] | null
}

function validatePatch(body: unknown): { errs: string[]; patch: PatchBody } {
  const errs: string[] = []
  if (!body || typeof body !== 'object') {
    return { errs: ['body_required'], patch: {} }
  }
  const b = body as PatchBody

  if (b.display_name !== undefined && b.display_name !== null && b.display_name !== '') {
    if (typeof b.display_name !== 'string' || !DISPLAY_NAME_RE.test(b.display_name)) {
      errs.push('display_name must match /^[a-zA-Z0-9_-]{2,24}$/')
    }
  }
  if (b.quote !== undefined && b.quote !== null && b.quote !== '') {
    if (typeof b.quote !== 'string') errs.push('quote must be a string')
    else if (b.quote.length > QUOTE_MAX_LENGTH) {
      errs.push(`quote must be ≤${QUOTE_MAX_LENGTH} chars`)
    } else if (/[\r\n]/.test(b.quote)) {
      errs.push('quote must be a single line')
    }
  }
  if (b.bio !== undefined && b.bio !== null && b.bio !== '') {
    if (typeof b.bio !== 'string') errs.push('bio must be a string')
    else if (b.bio.length > BIO_MAX_LENGTH) errs.push(`bio must be ≤${BIO_MAX_LENGTH} chars`)
    else if (b.bio.split('\n').length > 4) errs.push('bio must be ≤4 lines')
  }
  if (b.pinned_badges !== undefined && b.pinned_badges !== null) {
    if (!Array.isArray(b.pinned_badges)) {
      errs.push('pinned_badges must be an array')
    } else if (b.pinned_badges.length > PINNED_BADGES_MAX) {
      errs.push(`pinned_badges must be ≤${PINNED_BADGES_MAX} entries`)
    } else {
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

  return { errs, patch: b }
}

export async function handleTrainerProfilePatch(
  request: Request,
  pathname: string,
  env: Env,
): Promise<Response> {
  const m = pathname.match(/^\/v1\/trainer\/([a-f0-9]{8,16})\/profile$/)
  if (!m) return jsonResp({ error: 'invalid_path' }, 400)
  const anonId = m[1]!
  if (!ANON_ID_RE.test(anonId)) return jsonResp({ error: 'invalid_anon_id' }, 400)

  // Bearer auth — we re-use the arena_secret since it's the only credential
  // the trainer has. Profile edits require the same authn as arena actions.
  const bearer = extractBearer(request)
  if (!bearer) return jsonResp({ error: 'missing_bearer' }, 401)

  const arena = await getArena(env, anonId)
  if (!arena) return jsonResp({ error: 'trainer_not_enabled' }, 403)
  const incoming = await sha256Hex(bearer)
  if (!constantTimeEqual(incoming, arena.secret_hash)) {
    return jsonResp({ error: 'invalid_secret' }, 401)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return jsonResp({ error: 'invalid_json' }, 400)
  }
  const { errs, patch } = validatePatch(body)
  if (errs.length) return jsonResp({ error: 'validation', details: errs }, 400)

  // Load the existing record. If missing (trainer enabled but never
  // submitted), bootstrap a minimal one from the arena snapshot — covers
  // pre-Sprint-4.9 web-signup records that predate the enable-time bootstrap.
  let record = await getStats(env, anonId)
  if (!record) {
    record = bootstrapStatsFromArena(arena, 'web-profile-patch')
  }

  // Apply the patch. Explicit `null` resets to default ; missing keys are
  // left untouched. Empty string is treated as null for display_name and
  // quote (consistent with submit handler semantics).
  if ('display_name' in patch) {
    record.display_name = patch.display_name && patch.display_name !== '' ? patch.display_name : null
  }
  if ('quote' in patch) {
    record.quote = patch.quote && patch.quote !== '' ? patch.quote : null
  }
  if ('bio' in patch) {
    record.bio = patch.bio && patch.bio !== '' ? patch.bio : null
  }
  if ('pinned_badges' in patch) {
    const ownedBadges = new Set(record.stats.badges)
    record.pinned_badges = (patch.pinned_badges ?? [])
      .filter(b => ownedBadges.has(b))
      .slice(0, PINNED_BADGES_MAX)
  }

  await putStats(env, record)

  return jsonResp({
    ok: true,
    trainer: {
      anon_id: record.anon_id,
      display_name: record.display_name || null,
      quote: record.quote || null,
      bio: record.bio || null,
      pinned_badges: record.pinned_badges,
    },
  })
}
