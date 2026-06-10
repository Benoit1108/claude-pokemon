import { describe, it, expect } from 'vitest'
import { MockKV, makeEnv } from '../helpers/mockKV'
import {
  createSession,
  findOrCreateUserByIdentity,
  generateSessionToken,
  generateUserId,
  getUserFromSessionToken,
} from '../../src/lib/auth'
import { USER_ID_RE } from '../../src/types'

const NOW = '2026-06-10T12:00:00.000Z'

describe('auth — id generation', () => {
  it('user id is 16 hex chars', () => {
    expect(generateUserId()).toMatch(USER_ID_RE)
  })
  it('session token is 48 hex chars and unique', () => {
    const a = generateSessionToken()
    const b = generateSessionToken()
    expect(a).toMatch(/^[a-f0-9]{48}$/)
    expect(a).not.toBe(b)
  })
})

describe('findOrCreateUserByIdentity', () => {
  it('creates a user + identity on first sight, reuses it on the second', async () => {
    const env = makeEnv(new MockKV())
    const input = {
      provider: 'github' as const,
      externalId: '12345',
      github: { id: 12345, login: 'octocat' },
    }
    const u1 = await findOrCreateUserByIdentity(env, input, NOW)
    expect(u1.user_id).toMatch(USER_ID_RE)
    expect(u1.github).toEqual({ id: 12345, login: 'octocat' })
    expect(u1.linked_anon_ids).toEqual([])

    const u2 = await findOrCreateUserByIdentity(env, input, NOW)
    expect(u2.user_id).toBe(u1.user_id) // same identity → same user
  })

  it('different identities → different users', async () => {
    const env = makeEnv(new MockKV())
    const a = await findOrCreateUserByIdentity(
      env,
      { provider: 'github', externalId: '1', github: { id: 1, login: 'a' } },
      NOW,
    )
    const b = await findOrCreateUserByIdentity(
      env,
      { provider: 'email', externalId: 'b@example.com', email: { address: 'b@example.com' } },
      NOW,
    )
    expect(a.user_id).not.toBe(b.user_id)
    expect(b.email).toEqual({ address: 'b@example.com' })
  })
})

describe('sessions', () => {
  it('round-trips a session token to its user', async () => {
    const env = makeEnv(new MockKV())
    const user = await findOrCreateUserByIdentity(
      env,
      { provider: 'github', externalId: '9', github: { id: 9, login: 'z' } },
      NOW,
    )
    const token = await createSession(env, user.user_id, NOW)
    const resolved = await getUserFromSessionToken(env, token)
    expect(resolved?.user_id).toBe(user.user_id)
  })

  it('an unknown token resolves to null', async () => {
    const env = makeEnv(new MockKV())
    expect(await getUserFromSessionToken(env, 'deadbeef'.repeat(6))).toBeNull()
  })
})
