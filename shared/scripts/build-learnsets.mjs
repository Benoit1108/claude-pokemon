#!/usr/bin/env node
// Generator : data/pokeapi-learnsets.snapshot.json → shared/src/learnsets.generated.ts
//
// Offline, deterministic (sorted keys) so CI can drift-check the committed
// artifact. Run via `npm run build:learnsets` (shared/) or `npm run build:data`
// (repo root). Refresh the upstream snapshot with `npm run fetch:pokeapi`.
//
// Power normalization : the engine's damage formula expects a ~0.6-1.6
// multiplier (see moves.ts), PokéAPI gives raw base power (~40-250). We map
// BP/80 (so 80 BP ≈ neutral 1.0) clamped to [0.6, 1.6].

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const SNAPSHOT = join(here, '..', 'data', 'pokeapi-learnsets.snapshot.json')
const OUT = join(here, '..', 'src', 'learnsets.generated.ts')

const normalizePower = bp => Math.round(Math.min(1.6, Math.max(0.6, bp / 80)) * 100) / 100

const snap = JSON.parse(readFileSync(SNAPSHOT, 'utf8'))

const moveLines = Object.keys(snap.moves)
  .sort()
  .map(id => {
    const m = snap.moves[id]
    return `  ${JSON.stringify(id)}: { name: ${JSON.stringify(m.name_fr)}, type: '${m.type}', power: ${normalizePower(m.power)} },`
  })
  .join('\n')

const learnsetLines = Object.keys(snap.learnsets)
  .sort()
  .map(species => {
    const entries = snap.learnsets[species]
      .map(e => `{ move: ${JSON.stringify(e.move)}, level: ${e.level} }`)
      .join(', ')
    return `  ${JSON.stringify(species)}: [${entries}],`
  })
  .join('\n')

const out = `// AUTO-GENERATED — do not edit by hand.
// Source : data/pokeapi-learnsets.snapshot.json (PokéAPI). Regenerate with
// \`npm run build:learnsets\` (shared/) or \`npm run build:data\` (repo root).
// CI drift-checks this file. Refresh upstream data with \`npm run fetch:pokeapi\`.

import type { CombatType } from './types.js'

export interface GeneratedMove {
  name: string
  type: CombatType
  power: number
}

/** Offensive moves catalog, keyed by PokéAPI move id. */
export const GENERATED_MOVES: Record<string, GeneratedMove> = {
${moveLines}
}

/** Level-up offensive learnset per species (wild_pool id), sorted by level. */
export const SPECIES_LEARNSET: Record<string, { move: string; level: number }[]> = {
${learnsetLines}
}
`

writeFileSync(OUT, out)
console.log(
  `Wrote ${Object.keys(snap.moves).length} moves + ${Object.keys(snap.learnsets).length} learnsets → ${OUT}`,
)
