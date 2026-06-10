// Phase 2.11 — Pokédex achievements derived client-side from the trainer's
// `pokedex_seen_ids` (already carried in the submit payload + served by
// GET /v1/trainer). No worker/CLI change needed : we cross-reference the seen
// species ids against the bundled WILD_POKEMON pokédex data.

import { WILD_POKEMON } from '~/utils/pokedex'
import type { Rarity, WildPokemon } from '~/types/pokedex'

export interface GenProgress {
  gen: number
  seen: number
  total: number
  pct: number
}
export interface Milestone {
  key: string
  achieved: boolean
}
export interface PokedexAchievements {
  seen: number
  total: number
  pct: number
  perGen: GenProgress[]
  milestones: Milestone[]
  legendariesSeen: WildPokemon[]
}

const GEN1_STARTERS = ['bulbasaur', 'charmander', 'squirtle']

/** National dex → generation (Gen 1 = #1-151, Gen 2 = #152-251). */
function genOf(dex: number): number {
  return dex <= 151 ? 1 : 2
}

export function computePokedexAchievements(
  seenIds: string[] | undefined | null,
): PokedexAchievements {
  const seenSet = new Set(seenIds ?? [])
  const total = WILD_POKEMON.length
  const seen = WILD_POKEMON.reduce((n, p) => n + (seenSet.has(p.id) ? 1 : 0), 0)
  const pct = total ? Math.round((seen / total) * 100) : 0

  const byGen = new Map<number, { seen: number; total: number }>()
  for (const p of WILD_POKEMON) {
    const g = genOf(p.national_dex)
    const e = byGen.get(g) ?? { seen: 0, total: 0 }
    e.total++
    if (seenSet.has(p.id)) e.seen++
    byGen.set(g, e)
  }
  const perGen: GenProgress[] = [...byGen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([gen, e]) => ({
      gen,
      seen: e.seen,
      total: e.total,
      pct: e.total ? Math.round((e.seen / e.total) * 100) : 0,
    }))

  const sawRarity = (r: Rarity) => WILD_POKEMON.some(p => p.rarity === r && seenSet.has(p.id))
  const legendariesSeen = WILD_POKEMON.filter(p => p.rarity === 'legendary' && seenSet.has(p.id))

  const milestones: Milestone[] = [
    { key: 'pct_25', achieved: pct >= 25 },
    { key: 'pct_50', achieved: pct >= 50 },
    { key: 'pct_100', achieved: total > 0 && seen >= total },
    { key: 'gen1_starters', achieved: GEN1_STARTERS.every(id => seenSet.has(id)) },
    { key: 'saw_rare', achieved: sawRarity('rare') },
    { key: 'saw_legendary', achieved: legendariesSeen.length > 0 },
  ]

  return { seen, total, pct, perGen, milestones, legendariesSeen }
}
