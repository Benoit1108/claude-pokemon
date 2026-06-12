// planAutoSubmit (restored auto stats push). Pure planning logic — the
// detached network fire lives in statusline-entry and is covered by bats.
import { describe, it, expect } from 'vitest'
import { planAutoSubmit } from '../src/autosubmit.js'
import type { PokemonData, PokemonState } from '../src/state-types.js'

const NOW = '2026-06-12T12:00:00Z'
const NOW_EPOCH = Math.floor(Date.parse(NOW) / 1000)

const data: PokemonData = {
  version: '1.0.0',
  stats_share: { enabled: true, anon_id: 'abcd1234', endpoint: 'https://api', display_name: 'Sacha' },
}
const state: PokemonState = {
  lineage: 'fire',
  current_level: 40,
  lifetime_stats: { total_tokens: 123 },
}

describe('planAutoSubmit', () => {
  it('plans a submit when share is on, companion hatched, never submitted', () => {
    const plan = planAutoSubmit(state, data, NOW, NOW_EPOCH)
    expect(plan).not.toBeNull()
    expect(plan!.url).toBe('https://api/v1/submit')
    const p = plan!.payload as { anon_id: string; submitted_at: string; stats: { active: { lineage: string } } }
    expect(p.anon_id).toBe('abcd1234')
    expect(p.submitted_at).toBe(NOW)
    expect(p.stats.active.lineage).toBe('fire')
  })

  it('respects the 24h cooldown', () => {
    const recent = { ...state, last_stats_submit_at: '2026-06-12T01:00:00Z' } // 11h ago
    expect(planAutoSubmit(recent, data, NOW, NOW_EPOCH)).toBeNull()
    const stale = { ...state, last_stats_submit_at: '2026-06-11T01:00:00Z' } // 35h ago
    expect(planAutoSubmit(stale, data, NOW, NOW_EPOCH)).not.toBeNull()
  })

  it('skips when share is disabled / no companion / missing config', () => {
    expect(planAutoSubmit(state, { stats_share: { ...data.stats_share, enabled: false } }, NOW, NOW_EPOCH)).toBeNull()
    expect(planAutoSubmit({ ...state, lineage: null }, data, NOW, NOW_EPOCH)).toBeNull()
    expect(planAutoSubmit({ ...state, lineage: '' }, data, NOW, NOW_EPOCH)).toBeNull()
    expect(planAutoSubmit(state, { stats_share: { enabled: true, anon_id: '', endpoint: 'x' } }, NOW, NOW_EPOCH)).toBeNull()
    expect(planAutoSubmit(state, { stats_share: { enabled: true, anon_id: 'a', endpoint: '' } }, NOW, NOW_EPOCH)).toBeNull()
  })
})
