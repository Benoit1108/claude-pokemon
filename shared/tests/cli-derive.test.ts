// CLI engine adapter contract (Phase R3b). The bash bridge (lib/engine.mjs)
// depends on these exact shapes/formats: multipliers as fixed-1-decimal STRINGS
// ("2.0"), the rest as integers, level derived from total_xp when omitted, and
// null used_pct meaning neutral multipliers. Parity vs the bash engine itself
// is covered by tests/cli/engine-bridge.bats; this freezes the TS contract.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { derive } from '../src/cli.js'

const here = dirname(fileURLToPath(import.meta.url))
const thresholds: number[] = JSON.parse(
  readFileSync(join(here, '..', '..', 'lib', 'data.default.json'), 'utf8'),
).thresholds

describe('derive() — CLI engine adapter', () => {
  it('emits multipliers as fixed-1-decimal strings', () => {
    const out = derive({ thresholds, total_xp: 2_000_000, lineage: 'fire', used_pct: 20 })
    expect(out.xp_multiplier).toBe('2.0')
    expect(out.type_match_mult).toBe('1.2')
    expect(out.level).toBe(5)
    expect(typeof out.threshold).toBe('number')
    expect(typeof out.xp_to_next).toBe('number')
    expect(typeof out.progress_pct).toBe('number')
  })

  it('derives level from total_xp when level is omitted', () => {
    const out = derive({ thresholds, total_xp: 2_000_000, lineage: 'water' })
    expect(out.level).toBe(5)
  })

  it('respects an explicit level override', () => {
    const out = derive({ thresholds, total_xp: 2_000_000, level: 3, lineage: 'fire', used_pct: 20 })
    expect(out.level).toBe(3)
    expect(out.threshold).toBe(thresholds[3])
  })

  it('treats null used_pct as neutral context multiplier, 50% for type match', () => {
    const out = derive({ thresholds, total_xp: 1_000_000, lineage: 'fire', used_pct: null })
    expect(out.xp_multiplier).toBe('1.0') // neutral
    expect(out.type_match_mult).toBe('1.0') // fire at 50% → 1.0
  })

  it('covers every multiplier tier', () => {
    const tier = (pct: number) =>
      derive({ thresholds, total_xp: 0, lineage: 'other', used_pct: pct }).xp_multiplier
    expect(tier(10)).toBe('2.0')
    expect(tier(40)).toBe('1.5')
    expect(tier(60)).toBe('1.0')
    expect(tier(90)).toBe('0.5')
  })
})
