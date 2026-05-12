import { describe, it, expect, beforeEach } from 'vitest'
import { handleArenaEnable } from '../../../src/handlers/arena/enable'
import { handleArenaWhoami } from '../../../src/handlers/arena/whoami'
import { MockKV, makeEnv } from '../../helpers/mockKV'

const team = { anon_id: 'aaaaaaaa', lineage: 'fire', level: 30, is_shiny: false }

async function enable(env: ReturnType<typeof makeEnv>): Promise<string> {
  const res = await handleArenaEnable(
    new Request('https://x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(team),
    }),
    env,
  )
  return ((await res.json()) as { arena_secret: string }).arena_secret
}

function makeReq(anonId: string | null, secret: string | null): { req: Request; url: URL } {
  const url = new URL(`https://x/v1/arena/whoami${anonId ? `?anon_id=${anonId}` : ''}`)
  const headers: Record<string, string> = {}
  if (secret) headers.authorization = `Bearer ${secret}`
  const req = new Request(url, { method: 'GET', headers })
  return { req, url }
}

describe('handleArenaWhoami', () => {
  let kv: MockKV
  let env: ReturnType<typeof makeEnv>

  beforeEach(() => {
    kv = new MockKV()
    env = makeEnv(kv)
  })

  it('returns 200 with snapshot for valid creds', async () => {
    const secret = await enable(env)
    const { req, url } = makeReq('aaaaaaaa', secret)
    const res = await handleArenaWhoami(req, url, env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      ok: boolean
      anon_id: string
      origin: string
      team_snapshot: { lineage: string; level: number }
    }
    expect(body.ok).toBe(true)
    expect(body.anon_id).toBe('aaaaaaaa')
    expect(body.team_snapshot.lineage).toBe('fire')
    expect(body.team_snapshot.level).toBe(30)
  })

  it('returns 400 on missing anon_id', async () => {
    const { req, url } = makeReq(null, 'a'.repeat(32))
    const res = await handleArenaWhoami(req, url, env)
    expect(res.status).toBe(400)
  })

  it('returns 400 on malformed anon_id', async () => {
    const { req, url } = makeReq('not-hex!', 'a'.repeat(32))
    const res = await handleArenaWhoami(req, url, env)
    expect(res.status).toBe(400)
  })

  it('returns 401 on missing Bearer', async () => {
    await enable(env)
    const { req, url } = makeReq('aaaaaaaa', null)
    const res = await handleArenaWhoami(req, url, env)
    expect(res.status).toBe(401)
  })

  it('returns 401 on wrong Bearer', async () => {
    await enable(env)
    const { req, url } = makeReq('aaaaaaaa', 'f'.repeat(32))
    const res = await handleArenaWhoami(req, url, env)
    expect(res.status).toBe(401)
  })

  it('returns 404 when anon_id not enabled', async () => {
    const { req, url } = makeReq('bbbbbbbb', 'a'.repeat(32))
    const res = await handleArenaWhoami(req, url, env)
    expect(res.status).toBe(404)
  })
})
