// Golden parity (Phase R1b) — assert the TypeScript engine reproduces the bash
// engine's behavior line-for-line, using the R0 fixtures (tests/golden/fixtures/)
// as the contract. Same threshold table the bash side reads (lib/data.default.json)
// is fed to the pure TS functions, so any divergence in algorithm surfaces here.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  thresholdFor,
  levelFromXp,
  xpToNext,
  progressPct,
  xpMultiplier,
  typeMatchMultiplier,
  stageFor,
} from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..') // monorepo root

const thresholds: number[] = JSON.parse(
  readFileSync(join(root, 'lib', 'data.default.json'), 'utf8'),
).thresholds

function golden(name: string): Array<Record<string, unknown>> {
  const path = join(root, 'tests', 'golden', 'fixtures', `${name}.jsonl`)
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as Record<string, unknown>)
}

describe('XP curve parity with the bash engine (R0 goldens)', () => {
  it('thresholdFor == pokemon_threshold', () => {
    for (const c of golden('threshold')) {
      expect(String(thresholdFor(thresholds, c.level as number))).toBe(c.result)
    }
  })

  it('levelFromXp == pokemon_compute_level_from_xp', () => {
    for (const c of golden('level_from_xp')) {
      expect(String(levelFromXp(thresholds, c.total_xp as number))).toBe(c.result)
    }
  })

  it('xpToNext == pokemon_xp_to_next', () => {
    for (const c of golden('xp_to_next')) {
      expect(String(xpToNext(thresholds, c.total_xp as number, c.level as number))).toBe(c.result)
    }
  })

  it('progressPct == pokemon_progress_pct', () => {
    for (const c of golden('progress_pct')) {
      expect(String(progressPct(thresholds, c.total_xp as number, c.level as number))).toBe(
        c.result,
      )
    }
  })
})

describe('Context multiplier parity with the bash engine (R0 goldens)', () => {
  it('xpMultiplier == pokemon_xp_multiplier', () => {
    for (const c of golden('xp_multiplier')) {
      const pct = c.used_pct === '' ? null : (c.used_pct as number)
      expect(xpMultiplier(pct).toFixed(1)).toBe(c.result)
    }
  })

  it('typeMatchMultiplier == pokemon_type_match_mult', () => {
    for (const c of golden('type_match_mult')) {
      expect(typeMatchMultiplier(c.lineage as string, c.used_pct as number).toFixed(1)).toBe(
        c.result,
      )
    }
  })
})

describe('Evolution parity with the bash engine (R0 goldens)', () => {
  it('stageFor == pokemon_evo_field (incl. Eevee forms)', () => {
    for (const c of golden('evo_field')) {
      const form = (c.eevee_form as string) || undefined
      expect(stageFor(c.lineage as string, c.level as number, form).showdown_id).toBe(c.result)
    }
  })
})
