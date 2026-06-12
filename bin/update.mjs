#!/usr/bin/env node
// Native Node updater. Refresh runtime files + sprites + game content
// (state.json and config.json preserved). No bash / jq / chafa.
import { copyFileSync, cpSync, existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.CLAUDE_POKEMON_ROOT || join(fileURLToPath(new URL('.', import.meta.url)), '..')
const HOME = process.env.HOME || homedir()
const TARGET = join(HOME, '.claude', 'pokemon')

console.log('Update : runtime + sprites + contenu (state.json et config.json préservés)')
if (!existsSync(TARGET)) {
  console.error("Pas installé. Lance d'abord : npx claude-pokemon install")
  process.exit(1)
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

// Game CONTENT: copied fresh from the package — no merge, no allowlist (the
// old deepMerge let the user copy win on every content key forever; balance
// changes to lineages/items/… never reached existing users). User config lives
// in config.json and is simply left alone. Mirrors entry-io.ts CONFIG_KEYS.
const CONFIG_KEYS = [
  'language', 'theme', 'display_sprite_in_statusline', 'enable_animations', 'enable_sound',
  'shiny_mode', 'shiny_hunter_mode', 'starter_pick', 'stats_share', 'arena',
]
cp('lib/data.default.json', 'content.json')
const configPath = join(TARGET, 'config.json')
const legacyDataPath = join(TARGET, 'data.json')
if (!existsSync(configPath) && existsSync(legacyDataPath)) {
  // One-time migration of the pre-split single data.json.
  const legacy = JSON.parse(readFileSync(legacyDataPath, 'utf8'))
  const cfg = {}
  for (const k of CONFIG_KEYS) if (k in legacy) cfg[k] = legacy[k]
  writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n')
  renameSync(legacyDataPath, legacyDataPath + '.pre-split.bak')
  console.log('  data.json migré → content.json + config.json (backup .pre-split.bak)')
} else if (!existsSync(configPath)) {
  writeFileSync(configPath, '{}\n')
}
console.log('  contenu synchronisé (config.json préservé)')

console.log('✓ Update terminé. Relance Claude Code.')
