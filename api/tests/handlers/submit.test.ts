import { describe, it, expect, beforeEach } from 'vitest'
import { handleSubmit } from '../../src/handlers/submit'
import { getStats, getCooldown, setCooldown } from '../../src/lib/kv'
import { MockKV, makeEnv } from '../helpers/mockKV'

const validBody = {
  anon_id: 'abc12345',
  display_name: 'tester',
  schema_version: 1,
  client_version: '1.0.0-test',
  submitted_at: '2026-05-06T10:00:00Z',
  stats: {
    lifetime: {
      total_tokens: 1000,
      total_evolutions: 0,
      total_shinies: 0,
      max_level: 0,
      total_companions: 1,
      lineages_completed: [],
      games_won: 0,
      games_played: 0,
    },
    active: { lineage: 'fire', current_level: 0, is_shiny: false },
    badges: [],
    pokedex_seen_count: 0,
  },
}

function makeRequest(body: unknown): Request {
  return new Request('https://test/v1/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('handleSubmit', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('persists a valid payload and returns 200', async () => {
    const res = await handleSubmit(makeRequest(validBody), env)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ ok: true, next_submit_in_s: 86400 })

    // KV side-effect : record stored
    const stored = await getStats(env, 'abc12345')
    expect(stored?.display_name).toBe('tester')
    expect(stored?.stats.lifetime.total_tokens).toBe(1000)
  })

  it('sets a cooldown after successful submit', async () => {
    await handleSubmit(makeRequest(validBody), env)
    const cooldown = await getCooldown(env, 'abc12345')
    expect(cooldown).toBeTypeOf('number')
  })

  it('returns 429 when cooldown is active', async () => {
    await setCooldown(env, 'abc12345', 86400)
    const res = await handleSubmit(makeRequest(validBody), env)
    expect(res.status).toBe(429)
    const body = (await res.json()) as { error: string; cooldown_remaining_s: number }
    expect(body.error).toBe('rate_limited')
    expect(body.cooldown_remaining_s).toBeGreaterThan(0)
  })

  it('returns 400 on invalid JSON body', async () => {
    const req = new Request('https://test/v1/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: 'not-json{',
    })
    const res = await handleSubmit(req, env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid_json')
  })

  it('returns 400 with validation details on bad payload', async () => {
    const res = await handleSubmit(makeRequest({ ...validBody, anon_id: 'BAD!' }), env)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; details: string[] }
    expect(body.error).toBe('validation')
    expect(body.details.some(d => d.includes('anon_id'))).toBe(true)
  })

  it('preserves null display_name', async () => {
    await handleSubmit(makeRequest({ ...validBody, display_name: null }), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.display_name).toBeNull()
  })

  it('persists quote when provided', async () => {
    await handleSubmit(makeRequest({ ...validBody, quote: "Catch 'em all!" }), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.quote).toBe("Catch 'em all!")
  })

  it('stores null quote when omitted', async () => {
    await handleSubmit(makeRequest(validBody), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.quote).toBeNull()
  })

  it('rejects oversized quote with 400', async () => {
    const oversized = { ...validBody, quote: 'a'.repeat(81) }
    const res = await handleSubmit(makeRequest(oversized), env)
    expect(res.status).toBe(400)
  })

  // ---------------------------------------------------------------------------
  // Sprint 2.9 — bio + pinned_badges persistence
  // ---------------------------------------------------------------------------

  it('persists bio when provided', async () => {
    await handleSubmit(makeRequest({ ...validBody, bio: 'A trainer from Lavender Town.' }), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.bio).toBe('A trainer from Lavender Town.')
  })

  it('stores null bio + empty pinned_badges by default', async () => {
    await handleSubmit(makeRequest(validBody), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.bio).toBeNull()
    expect(stored?.pinned_badges).toEqual([])
  })

  it('persists pinned_badges (intersected with owned badges)', async () => {
    const body = {
      ...validBody,
      stats: { ...validBody.stats, badges: ['hatch', 'first_evolution', 'champion'] },
      // 'centurion' is not owned, must be filtered out by submit handler.
      pinned_badges: ['hatch', 'centurion', 'first_evolution'],
    }
    await handleSubmit(makeRequest(body), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.pinned_badges).toEqual(['hatch', 'first_evolution'])
  })

  it('persists pokedex_seen_ids and dedups them (Sprint 2.11)', async () => {
    const body = {
      ...validBody,
      stats: {
        ...validBody.stats,
        pokedex_seen_ids: ['pikachu', 'bulbasaur', 'pikachu', 'charmander'],
      },
    }
    await handleSubmit(makeRequest(body), env)
    const stored = await getStats(env, 'abc12345')
    // Sort for comparison since Set iteration order is insertion-preserving but
    // the dedup may shuffle perception. Here insertion order is preserved.
    expect(stored?.stats.pokedex_seen_ids).toEqual(['pikachu', 'bulbasaur', 'charmander'])
  })

  it('rejects bad pokedex ids with 400', async () => {
    const body = {
      ...validBody,
      stats: {
        ...validBody.stats,
        pokedex_seen_ids: ['Pikachu'], // uppercase forbidden
      },
    }
    const res = await handleSubmit(makeRequest(body), env)
    expect(res.status).toBe(400)
  })

  it('caps pinned_badges to 3 even if validation accepted them', async () => {
    // Extra defense in depth — if validation slipped, handler still slices.
    // This sends exactly 3, all owned, and confirms order is preserved.
    const body = {
      ...validBody,
      stats: { ...validBody.stats, badges: ['hatch', 'first_evolution', 'champion'] },
      pinned_badges: ['champion', 'hatch', 'first_evolution'],
    }
    await handleSubmit(makeRequest(body), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.pinned_badges).toEqual(['champion', 'hatch', 'first_evolution'])
  })

  it('overwrites previous record (idempotent re-submit after cooldown)', async () => {
    await handleSubmit(makeRequest(validBody), env)
    // Clear cooldown to allow second submit
    kv.clear()
    const updated = {
      ...validBody,
      stats: { ...validBody.stats, lifetime: { ...validBody.stats.lifetime, total_tokens: 5000 } },
    }
    await handleSubmit(makeRequest(updated), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.stats.lifetime.total_tokens).toBe(5000)
  })

  // ---------------------------------------------------------------------------
  // Sprint 4.1 — origin tracking
  // ---------------------------------------------------------------------------

  it("defaults origin to 'cli' on a legacy payload (no origin field)", async () => {
    await handleSubmit(makeRequest(validBody), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.origin).toBe('cli')
  })

  it("persists declared origin: 'web'", async () => {
    await handleSubmit(makeRequest({ ...validBody, origin: 'web' }), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.origin).toBe('web')
  })

  it("rejects origin: 'linked' from clients (worker-only state)", async () => {
    const res = await handleSubmit(makeRequest({ ...validBody, origin: 'linked' }), env)
    expect(res.status).toBe(400)
  })

  it('preserves existing origin across subsequent submits (web → CLI submit keeps web)', async () => {
    const { deleteCooldown } = await import('../../src/lib/kv')
    // Bootstrap with origin=web
    await handleSubmit(makeRequest({ ...validBody, origin: 'web' }), env)
    // Reset only the cooldown — preserve the stats record so we can verify
    // origin sticks across submits.
    await deleteCooldown(env, 'abc12345')
    // Re-submit without origin (mimics a CLI that doesn't know about the field)
    await handleSubmit(makeRequest(validBody), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.origin).toBe('web')
  })

  // ---------------------------------------------------------------------------
  // Back-compat — legacy `total_compagnons` key from old installed CLIs
  // ---------------------------------------------------------------------------

  it('accepts an OLD payload sending total_compagnons and stores it as total_companions', async () => {
    // Mimic a not-yet-updated installed CLI : sends only the French key.
    const legacyLifetime: Record<string, unknown> = {
      total_tokens: 1000,
      total_evolutions: 0,
      total_shinies: 0,
      max_level: 0,
      total_compagnons: 7,
      lineages_completed: [],
      games_won: 0,
      games_played: 0,
    }
    const legacyBody = {
      ...validBody,
      stats: { ...validBody.stats, lifetime: legacyLifetime },
    }
    const res = await handleSubmit(makeRequest(legacyBody), env)
    expect(res.status).toBe(200)
    const stored = await getStats(env, 'abc12345')
    // Stored + served under the canonical key, legacy key dropped.
    expect(stored?.stats.lifetime.total_companions).toBe(7)
    expect(stored?.stats.lifetime.total_compagnons).toBeUndefined()
  })

  it("freezes 'linked' once set — subsequent submits can't downgrade", async () => {
    const { deleteCooldown, putStats } = await import('../../src/lib/kv')
    // Bootstrap as web first
    await handleSubmit(makeRequest({ ...validBody, origin: 'web' }), env)
    // Manually flip to 'linked' (simulates the pair-redeem flow upgrading
    // the record server-side).
    const r = await getStats(env, 'abc12345')
    expect(r).not.toBeNull()
    if (r) {
      r.origin = 'linked'
      await putStats(env, r)
    }
    await deleteCooldown(env, 'abc12345')
    // Now a CLI submit declares origin=cli — must not flip back
    await handleSubmit(makeRequest({ ...validBody, origin: 'cli' }), env)
    const stored = await getStats(env, 'abc12345')
    expect(stored?.origin).toBe('linked')
  })
})
