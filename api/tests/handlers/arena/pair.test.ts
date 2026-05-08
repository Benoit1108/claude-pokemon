import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { handlePairInit } from '../../../src/handlers/arena/pair-init'
import { handlePairRedeem } from '../../../src/handlers/arena/pair-redeem'
import { MockKV, makeEnv } from '../../helpers/mockKV'
import { generatePairCode } from '../../../src/lib/arena'
import { PAIR_CODE_RE } from '../../../src/types'

const trainer = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 50,
  is_shiny: false,
}

async function enable(env: ReturnType<typeof makeEnv>): Promise<string> {
  const res = await handleArenaEnable(
    new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(trainer),
    }),
    env,
  )
  return ((await res.json()) as { arena_secret: string }).arena_secret
}

function makeReq(secret: string | null, body: unknown): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (secret) headers.authorization = `Bearer ${secret}`
  return new Request('https://x', { method: 'POST', headers, body: JSON.stringify(body) })
}

describe('Pair init', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('issues a 6-char code on a valid Bearer (200)', async () => {
    const secret = await enable(env)
    const res = await handlePairInit(makeReq(secret, { anon_id: 'aaaaaaaa' }), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as { code: string; ttl_s: number; expires_at: string }
    expect(PAIR_CODE_RE.test(body.code)).toBe(true)
    expect(body.ttl_s).toBe(300)
    expect(body.expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('rejects with 401 when Bearer is missing', async () => {
    await enable(env)
    const res = await handlePairInit(makeReq(null, { anon_id: 'aaaaaaaa' }), env)
    expect(res.status).toBe(401)
  })

  it('rejects with 401 on a wrong Bearer', async () => {
    await enable(env)
    const res = await handlePairInit(makeReq('deadbeef'.repeat(8), { anon_id: 'aaaaaaaa' }), env)
    expect(res.status).toBe(401)
  })

  it('rejects with 403 if the trainer is not arena-enabled', async () => {
    const secret = await enable(env)
    const res = await handlePairInit(makeReq(secret, { anon_id: 'bbbbbbbb' }), env)
    expect(res.status).toBe(403)
  })

  it('rejects with 400 on bad anon_id', async () => {
    const secret = await enable(env)
    const res = await handlePairInit(makeReq(secret, { anon_id: 'BAD!' }), env)
    expect(res.status).toBe(400)
  })
})

describe('Pair redeem', () => {
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    env = makeEnv(new MockKV())
  })

  it('returns the secret on a valid code (200) and consumes it (404 on second use)', async () => {
    const secret = await enable(env)
    const init = await handlePairInit(makeReq(secret, { anon_id: 'aaaaaaaa' }), env)
    const { code } = (await init.json()) as { code: string }

    const redeem = await handlePairRedeem(
      makeReq(null, { code }),
      env,
    )
    expect(redeem.status).toBe(200)
    const body = (await redeem.json()) as { anon_id: string; arena_secret: string }
    expect(body.anon_id).toBe('aaaaaaaa')
    expect(body.arena_secret).toBe(secret)

    // Second redeem of the same code — gone.
    const second = await handlePairRedeem(makeReq(null, { code }), env)
    expect(second.status).toBe(404)
  })

  it('rejects with 400 on malformed code', async () => {
    const res = await handlePairRedeem(makeReq(null, { code: 'no!' }), env)
    expect(res.status).toBe(400)
  })

  it('rejects with 400 on lowercase code (alphabet is uppercase only)', async () => {
    const res = await handlePairRedeem(makeReq(null, { code: 'abcdef' }), env)
    expect(res.status).toBe(400)
  })

  it('returns 404 on an unknown but well-formed code', async () => {
    const fake = generatePairCode()
    const res = await handlePairRedeem(makeReq(null, { code: fake }), env)
    expect(res.status).toBe(404)
  })

  // Sprint 2.13 (Q10) — only one redeemer wins under concurrent redeem.
  // MockKV is serial, but Promise.all + the claim-and-verify dance still
  // exercises both branches : the loser observes consumed_by !== its token
  // when re-reading.
  it('only one redeemer wins on concurrent redeem (Sprint 2.13 C2)', async () => {
    const secret = await enable(env)
    const init = await handlePairInit(makeReq(secret, { anon_id: 'aaaaaaaa' }), env)
    const { code } = (await init.json()) as { code: string }

    const [r1, r2] = await Promise.all([
      handlePairRedeem(makeReq(null, { code }), env),
      handlePairRedeem(makeReq(null, { code }), env),
    ])
    const statuses = [r1.status, r2.status].sort()
    expect(statuses).toEqual([200, 404])
  })

  it('redeeming a code already marked consumed_by returns 404', async () => {
    const secret = await enable(env)
    const init = await handlePairInit(makeReq(secret, { anon_id: 'aaaaaaaa' }), env)
    const { code } = (await init.json()) as { code: string }
    await handlePairRedeem(makeReq(null, { code }), env)
    // Even though TTL hasn't fired, the delete + the consumed_by check both
    // turn this into a 404.
    const second = await handlePairRedeem(makeReq(null, { code }), env)
    expect(second.status).toBe(404)
  })
})
