// IO plumbing for the Node entrypoints. POKEMON_DIR + POKEMON_NOW_EPOCH are
// read at MODULE LOAD (const), so each test sets the env, resets the module
// registry, and dynamic-imports a fresh copy.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let dir: string
const origDir = process.env.POKEMON_DIR
const origNow = process.env.POKEMON_NOW_EPOCH

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pkmn-'))
  process.env.POKEMON_DIR = dir
  vi.resetModules()
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  if (origDir === undefined) delete process.env.POKEMON_DIR
  else process.env.POKEMON_DIR = origDir
  if (origNow === undefined) delete process.env.POKEMON_NOW_EPOCH
  else process.env.POKEMON_NOW_EPOCH = origNow
})

async function load() {
  return import('../src/entry-io.js')
}
const write = (name: string, obj: unknown): void =>
  writeFileSync(join(dir, name), JSON.stringify(obj))

describe('readJsonFile', () => {
  it('ok with parsed value', async () => {
    write('x.json', { a: 1 })
    const io = await load()
    const r = io.readJsonFile(join(dir, 'x.json'))
    expect(r).toEqual({ ok: true, value: { a: 1 } })
  })
  it('missing → ok:false missing:true', async () => {
    const io = await load()
    const r = io.readJsonFile(join(dir, 'absent.json'))
    expect(r).toEqual({ ok: false, missing: true })
  })
  it('corrupt → ok:false missing:false with error', async () => {
    writeFileSync(join(dir, 'bad.json'), '{not json')
    const io = await load()
    const r = io.readJsonFile(join(dir, 'bad.json'))
    expect(r.ok).toBe(false)
    if (!r.ok && !r.missing) expect(typeof r.error).toBe('string')
  })
})

describe('writeJsonAtomic', () => {
  it('writes via tmp + rename, trailing newline', async () => {
    const io = await load()
    const p = join(dir, 'out.json')
    io.writeJsonAtomic(p, { hi: 'there' })
    expect(readFileSync(p, 'utf8')).toBe('{"hi":"there"}\n')
  })

  // Regression: the runtime has no flock, so a statusline tick and a /pokemon
  // command can write concurrently. A shared `<path>.tmp` let the second
  // writer's O_TRUNC blow away the first's buffer, publishing an empty save.
  it('uses a per-process temp file so concurrent writers cannot truncate', async () => {
    const io = await load()
    const p = join(dir, 'state.json')
    io.writeJsonAtomic(p, { a: 1 })
    expect(existsSync(`${p}.tmp`)).toBe(false)
    expect(existsSync(`${p}.${process.pid}.tmp`)).toBe(false) // renamed away
  })

  it('never leaves the destination empty when a stale shared tmp exists', async () => {
    const io = await load()
    const p = join(dir, 'state.json')
    writeFileSync(`${p}.tmp`, '') // a foreign writer mid-flight
    io.writeJsonAtomic(p, { a: 1 })
    expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual({ a: 1 })
  })
})

describe('nowEpochSeconds', () => {
  it('uses POKEMON_NOW_EPOCH when valid', async () => {
    process.env.POKEMON_NOW_EPOCH = '1700000000'
    const io = await load()
    expect(io.nowEpochSeconds()).toBe(1700000000)
  })
  it('falls back to real time when invalid', async () => {
    process.env.POKEMON_NOW_EPOCH = 'garbage'
    const io = await load()
    const before = Math.floor(Date.now() / 1000)
    expect(io.nowEpochSeconds()).toBeGreaterThanOrEqual(before - 2)
  })
  it('falls back when unset / non-positive', async () => {
    delete process.env.POKEMON_NOW_EPOCH
    const io = await load()
    expect(io.nowEpochSeconds()).toBeGreaterThan(0)
    process.env.POKEMON_NOW_EPOCH = '0'
    vi.resetModules()
    const io2 = await load()
    expect(io2.nowEpochSeconds()).toBeGreaterThan(1)
  })
})

describe('epochToIso', () => {
  it('formats without milliseconds', async () => {
    const io = await load()
    expect(io.epochToIso(1700000000)).toBe('2023-11-14T22:13:20Z')
  })
})

describe('deepMerge', () => {
  it('recursive merge, right wins, arrays replaced', async () => {
    const io = await load()
    expect(
      io.deepMerge({ a: { x: 1, y: 2 }, list: [1, 2] }, { a: { y: 9, z: 3 }, list: [3] }),
    ).toEqual({
      a: { x: 1, y: 9, z: 3 },
      list: [3],
    })
  })
  it('non-object right side replaces', async () => {
    const io = await load()
    expect(io.deepMerge({ a: 1 }, 5)).toBe(5)
    expect(io.deepMerge(7, { a: 1 })).toEqual({ a: 1 })
  })
})

describe('loadData', () => {
  it('split mode: content ⊕ config overlay', async () => {
    write('content.json', { thresholds: [0, 100], language: 'fr' })
    write('config.json', { language: 'en', theme: 'dark' })
    const io = await load()
    const r = io.loadData()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mode).toBe('split')
      expect(r.data.language).toBe('en')
      expect(r.data.theme).toBe('dark')
      expect(r.data.thresholds).toEqual([0, 100])
    }
  })
  it('split mode: missing config still loads content', async () => {
    write('content.json', { language: 'fr' })
    const io = await load()
    const r = io.loadData()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.mode).toBe('split')
  })
  it('split mode: corrupt config is fatal', async () => {
    write('content.json', { language: 'fr' })
    writeFileSync(join(dir, 'config.json'), '{bad')
    const io = await load()
    const r = io.loadData()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.file).toBe('config.json')
  })
  it('corrupt content is fatal', async () => {
    writeFileSync(join(dir, 'content.json'), '{bad')
    const io = await load()
    const r = io.loadData()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.file).toBe('content.json')
  })
  it('legacy mode: data.json when no content', async () => {
    write('data.json', { language: 'fr' })
    const io = await load()
    const r = io.loadData()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.mode).toBe('legacy')
  })
  it('missing data.json → ok:false missing:true', async () => {
    const io = await load()
    const r = io.loadData()
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.file).toBe('data.json')
      expect(r.missing).toBe(true)
    }
  })
  it('corrupt legacy data.json is fatal (not missing)', async () => {
    writeFileSync(join(dir, 'data.json'), '{bad')
    const io = await load()
    const r = io.loadData()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.missing).toBe(false)
  })
})

describe('saveUserConfig', () => {
  it('legacy mode writes whole data.json', async () => {
    const io = await load()
    io.saveUserConfig({ language: 'en', thresholds: [0, 1] }, 'legacy')
    expect(JSON.parse(readFileSync(join(dir, 'data.json'), 'utf8'))).toEqual({
      language: 'en',
      thresholds: [0, 1],
    })
  })
  it('split mode writes only CONFIG_KEYS to config.json', async () => {
    const io = await load()
    io.saveUserConfig(
      { language: 'en', theme: 'dark', thresholds: [0, 1], lineages: { a: 1 } },
      'split',
    )
    const cfg = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
    expect(cfg.language).toBe('en')
    expect(cfg.theme).toBe('dark')
    expect('thresholds' in cfg).toBe(false)
    expect('lineages' in cfg).toBe(false)
  })
  it('split mode preserves a hand-added non-allowlisted config key', async () => {
    write('config.json', { language: 'fr', custom_user_key: 'keepme' })
    const io = await load()
    io.saveUserConfig({ language: 'en' }, 'split')
    const cfg = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'))
    expect(cfg.custom_user_key).toBe('keepme')
    expect(cfg.language).toBe('en')
  })
})
