#!/usr/bin/env node
// Native Node updater (Phase R3d-5). Windows-native equivalent of
// bin/update.sh: refresh runtime files + sprites, migrate data.json (preserve
// user customisations + state.json). No bash / jq / chafa.
import { copyFileSync, cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.CLAUDE_POKEMON_ROOT || join(fileURLToPath(new URL('.', import.meta.url)), '..')
const HOME = process.env.HOME || homedir()
const TARGET = join(HOME, '.claude', 'pokemon')

console.log('Update : runtime + sprites + migration data.json (state.json préservé)')
if (!existsSync(TARGET)) {
  console.error("Pas installé. Lance d'abord : npx claude-pokemon install")
  process.exit(1)
}

// jq `*` semantics: recursive object merge, right operand wins; non-objects
// (incl. arrays) overwritten by the right operand.
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
function deepMerge(a, b) {
  if (!isObj(a) || !isObj(b)) return b
  const out = { ...a }
  for (const k of Object.keys(b)) out[k] = k in a ? deepMerge(a[k], b[k]) : b[k]
  return out
}

const cp = (rel, dst) => copyFileSync(join(ROOT, rel), join(TARGET, dst))
cp('lib/statusline.mjs', 'statusline.mjs')
cp('lib/pokemon.mjs', 'pokemon.mjs')
// Drop the legacy spawn-based engine bundle from existing installs (its only
// consumer was the deleted bash bridge — the entrypoints embed the engine).
try {
  unlinkSync(join(TARGET, 'engine.mjs'))
} catch {
  // already gone
}
mkdirSync(join(TARGET, 'locales'), { recursive: true })
cp('lib/locales/fr.json', 'locales/fr.json')
cp('lib/locales/en.json', 'locales/en.json')
const skillDir = join(HOME, '.claude', 'skills', 'pokemon')
mkdirSync(skillDir, { recursive: true })
copyFileSync(join(ROOT, 'skills/pokemon/SKILL.md'), join(skillDir, 'SKILL.md'))
for (const sub of ['sprites', 'sprites-mini']) {
  const src = join(ROOT, 'lib', sub)
  if (existsSync(src)) cpSync(src, join(TARGET, sub), { recursive: true })
}
console.log('  runtime + sprites synchronisés')

// Merge defaults into the user's data.json: user wins (recursive *), but the
// game-design constants + content arrays are force-propagated from defaults.
const def = JSON.parse(readFileSync(join(ROOT, 'lib', 'data.default.json'), 'utf8'))
const userPath = join(TARGET, 'data.json')
const user = JSON.parse(readFileSync(userPath, 'utf8'))
const merged = deepMerge(def, user)
merged.thresholds = def.thresholds
merged.version = def.version
merged.wild_pool = def.wild_pool
writeFileSync(userPath, JSON.stringify(merged, null, 2) + '\n')
console.log('  data.json migré (customisations préservées)')

console.log('✓ Update terminé. Relance Claude Code.')
