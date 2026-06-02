#!/usr/bin/env node
// Generator : lib/data/wild_pool/*.json → shared/src/species-combat-type.generated.ts
//
// The CLI wild pool is the single source of truth for every species' canonical
// type. This emits a flat { speciesId: CombatType } map the battle engine can
// resolve without re-declaring 251 entries by hand.
//
// Deterministic (keys sorted) so the CI drift-check can diff the committed
// artifact against a fresh build. Run via `npm run build:species` from shared/,
// or `npm run build:data` from the repo root.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const WILD_POOLS = ['gen1', 'gen2'].map(g =>
  join(repoRoot, 'lib', 'data', 'wild_pool', `${g}.json`),
)
const OUT = join(here, '..', 'src', 'species-combat-type.generated.ts')

// Must stay in sync with COMBAT_TYPES in src/types.ts. Kept as a literal here
// so the generator has zero build-time dependency on the TS source.
const COMBAT_TYPES = new Set([
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
])

const map = {}
for (const file of WILD_POOLS) {
  const { wild_pool: pool } = JSON.parse(readFileSync(file, 'utf8'))
  for (const species of pool) {
    const type = String(species.type).toLowerCase()
    if (!COMBAT_TYPES.has(type)) {
      throw new Error(`Unknown type "${species.type}" for species "${species.id}" in ${file}`)
    }
    if (map[species.id] && map[species.id] !== type) {
      throw new Error(`Conflicting type for "${species.id}": ${map[species.id]} vs ${type}`)
    }
    map[species.id] = type
  }
}

const entries = Object.keys(map)
  .sort()
  .map(id => `  ${JSON.stringify(id)}: '${map[id]}',`)
  .join('\n')

const out = `// AUTO-GENERATED — do not edit by hand.
// Source : lib/data/wild_pool/*.json. Regenerate with \`npm run build:species\`
// (shared/) or \`npm run build:data\` (repo root). CI drift-checks this file.

import type { CombatType } from './types.js'

export const SPECIES_COMBAT_TYPE: Record<string, CombatType> = {
${entries}
}
`

writeFileSync(OUT, out)
console.log(`Wrote ${Object.keys(map).length} species → ${OUT}`)
