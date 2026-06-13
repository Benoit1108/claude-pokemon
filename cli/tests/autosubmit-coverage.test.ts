// Top-up branches for planAutoSubmit not hit by autosubmit.test.ts: the literal
// 'null' lineage guard, the unparseable last_stats_submit_at fallback, and the
// version / display_name defaults in the payload build.
import { describe, it, expect } from 'vitest'
import { planAutoSubmit } from '../src/autosubmit.js'
import type { PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

const NOW = '2026-06-12T12:00:00Z'
const NOW_EPOCH = Math.floor(Date.parse(NOW) / 1000)

const data: PokemonData = {
  stats_share: { enabled: true, anon_id: 'abcd1234', endpoint: 'https://api' },
}
const state: PokemonState = { lineage: 'fire', current_level: 40, total_xp: 100 }

describe('planAutoSubmit top-up', () => {
  it('skips the literal-string "null" lineage', () => {
    expect(planAutoSubmit({ ...state, lineage: 'null' }, data, NOW, NOW_EPOCH)).toBeNull()
  })
  it('treats an unparseable last submit time as epoch 0 (submit due)', () => {
    const s = { ...state, last_stats_submit_at: 'not-a-date' }
    expect(planAutoSubmit(s, data, NOW, NOW_EPOCH)).not.toBeNull()
  })
  it('defaults version to "unknown" and display_name to empty', () => {
    const plan = planAutoSubmit(state, data, NOW, NOW_EPOCH)
    expect(plan).not.toBeNull()
    const p = plan!.payload as { client_version?: string; version?: string }
    expect(JSON.stringify(p)).toContain('unknown')
  })
})
