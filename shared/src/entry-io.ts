// Shared IO plumbing for the Node entrypoints (statusline-entry / pokemon-entry).
//
// The critical contract: a state.json that EXISTS but doesn't parse must be
// FATAL, never silently treated as `{}` — the old behavior re-initialized the
// save as a fresh egg and overwrote the user's companion (data-loss). Missing
// file ≠ corrupt file.
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const POKEMON_DIR = process.env.POKEMON_DIR || join(homedir(), '.claude', 'pokemon')
export const DATA_PATH = join(POKEMON_DIR, 'data.json')
export const STATE_PATH = join(POKEMON_DIR, 'state.json')

export type JsonReadResult =
  | { ok: true; value: unknown }
  | { ok: false; missing: true }
  | { ok: false; missing: false; error: string }

/** Read + parse a JSON file, distinguishing "absent" from "corrupt". */
export function readJsonFile(path: string): JsonReadResult {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return { ok: false, missing: true }
  }
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch (err) {
    return { ok: false, missing: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Atomic write (tmp + rename) — a crash mid-write never truncates the save. */
export function writeJsonAtomic(path: string, obj: unknown): void {
  writeFileSync(path + '.tmp', JSON.stringify(obj) + '\n')
  renameSync(path + '.tmp', path)
}

/** Epoch seconds. POKEMON_NOW_EPOCH is a test seam (pins the clock for the
 *  golden tests); garbage values fall back to real time instead of crashing. */
export function nowEpochSeconds(): number {
  const override = Number(process.env.POKEMON_NOW_EPOCH)
  return Number.isFinite(override) && override > 0 ? Math.floor(override) : Math.floor(Date.now() / 1000)
}

export function epochToIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}
