#!/usr/bin/env node
// Native Node installer. Sets up ~/.claude/pokemon/ and registers the
// statusLine, using only Node (no bash / jq / chafa / flock). Registers the
// Node entrypoints (statusline.mjs / pokemon.mjs) — the runtime is bash-free.
// Idempotent; preserves an existing state.json / data.json. Backs up
// settings.json.
import { mkdirSync, copyFileSync, cpSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = process.env.CLAUDE_POKEMON_ROOT || join(fileURLToPath(new URL('.', import.meta.url)), '..')
const HOME = process.env.HOME || homedir()
const CLAUDE = join(HOME, '.claude')
const TARGET = join(CLAUDE, 'pokemon')
const SKILL_DIR = join(CLAUDE, 'skills', 'pokemon')
const SETTINGS = join(CLAUDE, 'settings.json')

const B = '\x1b[1m', R = '\x1b[0m', G = '\x1b[32m', Y = '\x1b[33m', D = '\x1b[2m'
const ok = (m) => console.log(`${G}✓${R} ${m}`)
const warn = (m) => console.log(`${Y}!${R} ${m}`)
const title = (m) => console.log(`\n${B}${m}${R}\n`)

// ── 1. Prereqs ───────────────────────────────────────────────────────────────
title('1/4 Vérification des prérequis')
ok(`node ${process.version}`)
// jq / bash / chafa / flock are no longer required at runtime (Node-native).

// ── 2. Directory structure ───────────────────────────────────────────────────
title('2/4 Création de l’arborescence + fichiers')
for (const d of ['locales', 'sprites/normal', 'sprites/shiny', 'sprites-mini/normal', 'sprites-mini/shiny']) {
  mkdirSync(join(TARGET, d), { recursive: true })
}
mkdirSync(SKILL_DIR, { recursive: true })

// ── 3. Copy runtime files ────────────────────────────────────────────────────
const cp = (rel, dst = rel) => copyFileSync(join(ROOT, rel), join(TARGET, dst))
// Node bundles (the Windows-native runtime).
cp('lib/statusline.mjs', 'statusline.mjs')
cp('lib/pokemon.mjs', 'pokemon.mjs')
cp('lib/locales/fr.json', 'locales/fr.json')
cp('lib/locales/en.json', 'locales/en.json')
copyFileSync(join(ROOT, 'skills/pokemon/SKILL.md'), join(SKILL_DIR, 'SKILL.md'))
// Pre-rendered sprites (shipped — no chafa/network).
for (const sub of ['sprites', 'sprites-mini']) {
  const src = join(ROOT, 'lib', sub)
  if (existsSync(src)) cpSync(src, join(TARGET, sub), { recursive: true })
}
ok('Runtime (bundles Node + locales + sprites + skill) installé')

// Game CONTENT: always copied fresh from the package (balance changes reach
// every user). User CONFIG is a small separate overlay, preserved across
// installs. Mirrors entry-io.ts CONFIG_KEYS.
const CONFIG_KEYS = [
  'language', 'theme', 'display_sprite_in_statusline', 'enable_animations', 'enable_sound',
  'shiny_mode', 'shiny_hunter_mode', 'starter_pick', 'stats_share', 'arena',
]
cp('lib/data.default.json', 'content.json')
const configPath = join(TARGET, 'config.json')
const legacyDataPath = join(TARGET, 'data.json')
if (!existsSync(configPath)) {
  if (existsSync(legacyDataPath)) {
    // One-time migration of the pre-split single data.json: keep ONLY the
    // user-owned keys; the content half is superseded by content.json.
    const legacy = JSON.parse(readFileSync(legacyDataPath, 'utf8'))
    const cfg = {}
    for (const k of CONFIG_KEYS) if (k in legacy) cfg[k] = legacy[k]
    writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n')
    renameSync(legacyDataPath, legacyDataPath + '.pre-split.bak')
    ok('data.json migré → content.json + config.json (backup .pre-split.bak)')
  } else {
    writeFileSync(configPath, '{}\n')
    ok('config.json initialisé (défauts du contenu)')
  }
} else {
  warn('config.json existe déjà — préservé')
}

// state.json — init a fresh egg only if missing.
if (!existsSync(join(TARGET, 'state.json'))) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const state = {
    version: 2, lineage: null, is_shiny: false, current_level: 0, total_xp: 0,
    evolution_history: [], evolution_flash_remaining: 10, sessions: {},
    created_at: now, last_updated: now,
    badges: [], team: [], pc_storage: [], pokedex: {},
    lifetime_stats: {
      total_tokens: 0, total_evolutions: 0, total_shinies: 0, max_level: 0,
      lineages_completed: [], total_compagnons: 1, first_shiny_at: null,
    },
    items: {}, eevee_form: null, high_context_streak: 0, status: 'ok',
  }
  writeFileSync(join(TARGET, 'state.json'), JSON.stringify(state, null, 2) + '\n')
  ok('state.json initialisé (œuf neuf)')
} else {
  warn('state.json existe — ton compagnon actuel est préservé')
}

// ── 4. settings.json statusLine (Node entrypoint) ────────────────────────────
title('4/4 Configuration de la statusLine')
let settings = {}
if (existsSync(SETTINGS)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '').replace(/\.\d+Z$/, 'Z')
  copyFileSync(SETTINGS, `${SETTINGS}.bak-pokemon-${stamp}`)
  try {
    settings = JSON.parse(readFileSync(SETTINGS, 'utf8'))
  } catch {
    settings = {}
  }
}
settings.statusLine = { type: 'command', command: `node ${join(TARGET, 'statusline.mjs')}` }
writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n')
ok('settings.json mis à jour (statusLine → node, backup créé)')

title('Installation terminée 🎉')
console.log(`${D}Relance Claude Code. Tape /pokemon pour voir ton compagnon.${R}`)
