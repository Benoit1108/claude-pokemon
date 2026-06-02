#!/usr/bin/env node
// MANUAL refresh step (network) — NOT run in CI.
//
// Fetches the level-up offensive movesets for every species in the CLI
// wild_pool (Gen 1-2, dex 1-251) from PokéAPI and writes a minimal, committed
// snapshot (`data/pokeapi-learnsets.snapshot.json`). The deterministic build
// step (build-learnsets.mjs) consumes this snapshot offline, mirroring the
// `lib/data → data.default.json` philosophy : network is isolated here, CI
// only ever diffs the committed artifact.
//
// We fetch by national dex number (not name) so wild_pool ids like `nidoranf`
// / `mrmime` don't need a name-normalization table.
//
// Data : PokéAPI (https://pokeapi.co) — free, attribution kept in the snapshot.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..', '..')
const OUT_DIR = join(here, '..', 'data')
const OUT = join(OUT_DIR, 'pokeapi-learnsets.snapshot.json')
const API = 'https://pokeapi.co/api/v2'
const CONCURRENCY = 8

// dex → wild_pool id, so the learnset is keyed by the engine's species id.
const dexToId = {}
for (const gen of ['gen1', 'gen2']) {
  const { wild_pool } = JSON.parse(
    readFileSync(join(repoRoot, 'lib', 'data', 'wild_pool', `${gen}.json`), 'utf8'),
  )
  for (const s of wild_pool) dexToId[s.national_dex] = s.id
}

async function getJson(url, tries = 3) {
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (attempt === tries) throw err
      await new Promise(r => setTimeout(r, 400 * attempt))
    }
  }
}

async function mapPool(items, fn, concurrency) {
  const out = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i], i)
      }
    }),
  )
  return out
}

const moveCache = new Map()
async function getMove(name) {
  if (moveCache.has(name)) return moveCache.get(name)
  const m = await getJson(`${API}/move/${name}`)
  const fr = m.names.find(n => n.language.name === 'fr')?.name ?? m.name
  const info = {
    type: m.type.name,
    power: m.power, // null for status moves
    damage_class: m.damage_class?.name ?? 'status',
    name_fr: fr,
  }
  moveCache.set(name, info)
  return info
}

const dexNumbers = Object.keys(dexToId)
  .map(Number)
  .sort((a, b) => a - b)

console.log(`Fetching ${dexNumbers.length} species…`)

const learnsets = {}
const moves = {}

await mapPool(
  dexNumbers,
  async dex => {
    const id = dexToId[dex]
    const poke = await getJson(`${API}/pokemon/${dex}`)
    // For each move : the lowest level it's learned by level-up (0 → 1).
    const levelByMove = new Map()
    for (const entry of poke.moves) {
      let lvl = Infinity
      for (const v of entry.version_group_details) {
        if (v.move_learn_method.name !== 'level-up') continue
        lvl = Math.min(lvl, v.level_learned_at || 1)
      }
      if (lvl !== Infinity) levelByMove.set(entry.move.name, Math.max(1, lvl))
    }

    const list = []
    for (const [moveName, level] of levelByMove) {
      const info = await getMove(moveName)
      if (info.damage_class === 'status' || !info.power) continue // offensive only
      moves[moveName] = { name_fr: info.name_fr, type: info.type, power: info.power }
      list.push({ move: moveName, level })
    }
    list.sort((a, b) => a.level - b.level || a.move.localeCompare(b.move))
    learnsets[id] = list
    return null
  },
  CONCURRENCY,
)

// Deterministic ordering for a reviewable, drift-stable snapshot.
const sortedMoves = {}
for (const k of Object.keys(moves).sort()) sortedMoves[k] = moves[k]
const sortedLearnsets = {}
for (const k of Object.keys(learnsets).sort()) sortedLearnsets[k] = learnsets[k]

const snapshot = {
  _source: 'PokéAPI (https://pokeapi.co) — level-up offensive moves, dex 1-251',
  _note: 'Manual refresh via `npm run fetch:pokeapi`. Do not edit by hand. Consumed offline by build-learnsets.mjs.',
  moves: sortedMoves,
  learnsets: sortedLearnsets,
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n')
console.log(
  `Wrote ${Object.keys(sortedMoves).length} moves, ${Object.keys(sortedLearnsets).length} learnsets → ${OUT}`,
)
