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
  return Number.isFinite(override) && override > 0
    ? Math.floor(override)
    : Math.floor(Date.now() / 1000)
}

export function epochToIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

// ── Config / content split ───────────────────────────────────────────────────
// Game CONTENT (lineages, wild_pool, thresholds, items, …) ships with the
// package and is copied verbatim to content.json at install/update — balance
// changes always reach users. USER CONFIG is a small overlay (config.json)
// merged at read time. This kills the old single data.json whose update-time
// deepMerge let the user copy win on every content key forever (only a
// hand-kept allowlist was force-propagated — `lineages` wasn't on it).
//
// LEGACY mode: installs that still have only data.json keep working unchanged
// (the migration happens on the next `install`/`update` run).
export const CONTENT_PATH = join(POKEMON_DIR, 'content.json')
export const CONFIG_PATH = join(POKEMON_DIR, 'config.json')

/** The user-owned keys (stable, bounded — unlike the ever-growing content).
 *  SOURCE OF TRUTH. Mirrored as inline arrays in bin/install.mjs +
 *  bin/update.mjs (standalone Node scripts that can't import TS); the
 *  config-keys-sync vitest asserts the three stay identical. */
export const CONFIG_KEYS = [
  'language',
  'theme',
  'display_sprite_in_statusline',
  'enable_animations',
  'enable_sound',
  'shiny_mode',
  'shiny_hunter_mode',
  'starter_pick',
  'stats_share',
  'arena',
] as const

const isObj = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)

/** jq `*` semantics: recursive object merge, right side wins; arrays replaced. */
export function deepMerge(a: unknown, b: unknown): unknown {
  if (!isObj(a) || !isObj(b)) return b
  const out: Record<string, unknown> = { ...a }
  for (const k of Object.keys(b)) out[k] = k in a ? deepMerge(a[k], b[k]) : b[k]
  return out
}

export type DataLoad =
  | { ok: true; data: Record<string, unknown>; mode: 'split' | 'legacy' }
  | { ok: false; file: string; missing: boolean; error?: string }

/** Read the runtime data document: content.json ⊕ config.json overlay (split
 *  mode), or the legacy single data.json. Corrupt files are fatal (ok:false). */
export function loadData(): DataLoad {
  const content = readJsonFile(CONTENT_PATH)
  if (content.ok) {
    const config = readJsonFile(CONFIG_PATH)
    if (!config.ok && !config.missing)
      return { ok: false, file: 'config.json', missing: false, error: config.error }
    const merged = deepMerge(content.value, config.ok ? config.value : {}) as Record<
      string,
      unknown
    >
    return { ok: true, data: merged, mode: 'split' }
  }
  if (!content.missing)
    return { ok: false, file: 'content.json', missing: false, error: content.error }
  const legacy = readJsonFile(DATA_PATH)
  if (legacy.ok) return { ok: true, data: legacy.value as Record<string, unknown>, mode: 'legacy' }
  return legacy.missing
    ? { ok: false, file: 'data.json', missing: true }
    : { ok: false, file: 'data.json', missing: false, error: legacy.error }
}

/** Persist a runtime mutation of the merged document. Split mode writes only
 *  the user-owned keys to config.json (content is never written at runtime);
 *  legacy mode keeps writing the whole data.json as before. */
export function saveUserConfig(merged: Record<string, unknown>, mode: 'split' | 'legacy'): void {
  if (mode === 'legacy') {
    writeJsonAtomic(DATA_PATH, merged)
    return
  }
  // Start from the on-disk config so any hand-added key the user put in
  // config.json (outside CONFIG_KEYS) survives a config write — then overwrite
  // the allowlisted keys from the freshly-mutated merged document. Content keys
  // never enter config.json (they're not in CONFIG_KEYS and not in the prior
  // config.json), so no content bleed.
  const existing = readJsonFile(CONFIG_PATH)
  const cfg: Record<string, unknown> =
    existing.ok && isObj(existing.value) ? { ...existing.value } : {}
  for (const k of CONFIG_KEYS) if (k in merged) cfg[k] = merged[k]
  writeJsonAtomic(CONFIG_PATH, cfg)
}
