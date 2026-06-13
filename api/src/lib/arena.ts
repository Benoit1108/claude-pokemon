// Arena auth + ID generation primitives.
// Kept separate from battle.ts (pure resolution) to make the security
// surface easy to audit.

const HEX = '0123456789abcdef'

/**
 * Generate a fresh arena_secret as 32 lowercase hex chars (128 bits of entropy).
 * Uses crypto.getRandomValues, available in Cloudflare Workers + modern Node.
 */
export function generateArenaSecret(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    out += HEX[b >> 4]! + HEX[b & 0x0f]! // nibbles are 0–15, HEX has 16 chars
  }
  return out
}

/**
 * Generate a battle_id: 32 hex chars (128 bits — guarantees no collision over
 * a few billion battles).
 */
export function generateBattleId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    out += HEX[b >> 4]! + HEX[b & 0x0f]! // nibbles are 0–15, HEX has 16 chars
  }
  return out
}

/** Generate a 6-char human-friendly pairing code from the safe alphabet
 * (Sprint 2.12). Uses crypto.getRandomValues so codes aren't predictable. */
export function generatePairCode(): string {
  // PAIR_CODE_ALPHABET has 31 chars ; rejection-sample to avoid modulo bias.
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTVWXYZ23456789'
  const len = 6
  const bytes = new Uint8Array(len * 2) // oversample so we rarely need a re-roll
  crypto.getRandomValues(bytes)
  let out = ''
  let idx = 0
  while (out.length < len) {
    if (idx >= bytes.length) {
      crypto.getRandomValues(bytes)
      idx = 0
    }
    const b = bytes[idx++]!
    if (b < 31 * 8) {
      out += ALPHABET[b % 31]
    }
  }
  return out
}

/** Random uint32 seed for the battle PRNG. */
export function randomSeed(): number {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return arr[0]!
}

/**
 * SHA-256 hex digest of the input string. Used to store arena_secret hash
 * server-side without ever persisting the plaintext.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(buf)
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!
    out += HEX[b >> 4]! + HEX[b & 0x0f]! // nibbles are 0–15, HEX has 16 chars
  }
  return out
}

/**
 * Constant-time string comparison. Avoids leaking secret length / position
 * via timing side-channel when comparing hashes.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** Extract the Bearer token from an Authorization header, or null. */
export function extractBearer(request: Request): string | null {
  const auth = request.headers.get('authorization') || ''
  const m = /^Bearer\s+([a-f0-9]{32,64})$/i.exec(auth)
  return m ? m[1]!.toLowerCase() : null
}
