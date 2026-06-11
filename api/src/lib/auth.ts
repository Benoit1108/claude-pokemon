// Identity + session primitives (Phase R2a, ADR-008/010).
//
// Provider-agnostic core: GitHub OAuth (R2b) and email magic-link (R2e) both
// resolve to an identity, then call findOrCreateUserByIdentity + createSession.
//
// Sessions use OPAQUE tokens (not JWT): the client holds a random token, the
// server stores only its sha256 under `session:<hash>` → user_id (KV TTL). This
// is revocable (delete the key) and matches the existing arena_secret pattern.

import type { Env } from '../env.d'
import type { IdentityProvider, UserRecord } from '../types'
import { sha256Hex } from './arena'
import {
  getAnonLink,
  getIdentity,
  getSession,
  getUser,
  putAnonLink,
  putIdentity,
  putSession,
  putUser,
} from './kv'

const HEX = '0123456789abcdef'

function randomHex(byteLen: number): string {
  const bytes = new Uint8Array(byteLen)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    out += HEX[b >> 4] + HEX[b & 0x0f]
  }
  return out
}

/** Internal user id — 16 hex chars (64 bits, collision-safe at our scale). */
export function generateUserId(): string {
  return randomHex(8)
}

/** Opaque session token — 48 hex chars (192 bits). The client keeps this; the
 * server only ever stores its sha256. Matches `extractBearer`'s {32,64} range. */
export function generateSessionToken(): string {
  return randomHex(24)
}

export interface IdentityInput {
  provider: IdentityProvider
  /** Stable external id : GitHub numeric id (as string), or lowercased email. */
  externalId: string
  github?: { id: number; login: string }
  email?: { address: string }
}

/**
 * Resolve an identity to its user, creating the user on first sight. The
 * `identity:<provider>:<externalId>` key maps to a stable `user_id`, so the same
 * GitHub account / email always lands on the same user.
 */
export async function findOrCreateUserByIdentity(
  env: Env,
  input: IdentityInput,
  now: string,
): Promise<UserRecord> {
  const existingUserId = await getIdentity(env, input.provider, input.externalId)
  if (existingUserId) {
    const existing = await getUser(env, existingUserId)
    if (existing) return existing
    // Dangling identity (user purged) — fall through and recreate cleanly.
  }

  const user: UserRecord = {
    user_id: generateUserId(),
    created_at: now,
    updated_at: now,
    github: input.github ?? null,
    email: input.email ?? null,
    linked_anon_ids: [],
    display_name: null,
  }
  await putUser(env, user)
  await putIdentity(env, input.provider, input.externalId, user.user_id)
  return user
}

/** Issue a session for a user. Returns the PLAINTEXT token (store only the hash). */
export async function createSession(env: Env, userId: string, now: string): Promise<string> {
  const token = generateSessionToken()
  const hash = await sha256Hex(token)
  await putSession(env, hash, { user_id: userId, created_at: now })
  return token
}

/** Resolve a plaintext session token to its user, or null if invalid/expired. */
export async function getUserFromSessionToken(env: Env, token: string): Promise<UserRecord | null> {
  const hash = await sha256Hex(token)
  const session = await getSession(env, hash)
  if (!session) return null
  return await getUser(env, session.user_id)
}

/**
 * Link a legacy anon_id to a user (ADR-010, link-never-destroy). Idempotent.
 * Caller MUST have already proven ownership of the anon account (arena_secret).
 * Throws 'already_linked' if the anon_id is claimed by a different user.
 */
export async function linkAnonToUser(
  env: Env,
  user: UserRecord,
  anonId: string,
  now: string,
): Promise<UserRecord> {
  if (user.linked_anon_ids.includes(anonId)) return user
  const existingOwner = await getAnonLink(env, anonId)
  if (existingOwner && existingOwner !== user.user_id) {
    throw new Error('already_linked')
  }
  const updated: UserRecord = {
    ...user,
    linked_anon_ids: [...user.linked_anon_ids, anonId],
    updated_at: now,
  }
  await putUser(env, updated)
  await putAnonLink(env, anonId, user.user_id)
  return updated
}
