#!/usr/bin/env node
// Native Node uninstaller (Phase R3d-5). Windows-native equivalent of
// bin/uninstall.sh: removes the install + statusLine entry, backing up first.
// No bash / jq / tar — backups are made by renaming aside.
import { existsSync, readFileSync, writeFileSync, copyFileSync, renameSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = process.env.HOME || homedir()
const CLAUDE = join(HOME, '.claude')
const B = '\x1b[1m', R = '\x1b[0m', G = '\x1b[32m', Y = '\x1b[33m', D = '\x1b[2m'

console.log(`\n${B}Désinstallation claude-pokemon${R}\n`)
console.log(`${Y}⚠ Cette action va supprimer :${R}`)
console.log('  - ~/.claude/pokemon/ (données + sprites)')
console.log('  - ~/.claude/skills/pokemon/')
console.log('  - L’entrée statusLine dans ~/.claude/settings.json')
console.log(`\n${D}Des backups seront créés.${R}\n`)

if (process.argv[2] !== '--confirm') {
  console.log(`Pour confirmer : ${B}npx claude-pokemon uninstall --confirm${R}`)
  process.exit(0)
}

const ts = new Date().toISOString().replace(/[:.]/g, '').replace(/Z$/, '')
const pokemonDir = join(CLAUDE, 'pokemon')
if (existsSync(pokemonDir)) {
  const backups = join(CLAUDE, 'backups')
  mkdirSync(backups, { recursive: true })
  renameSync(pokemonDir, join(backups, `pokemon-${ts}`))
  console.log(`${G}✓${R} ~/.claude/pokemon/ supprimé (backup → .claude/backups/)`)
}
for (const f of [join(CLAUDE, 'statusline-command.sh'), join(CLAUDE, 'pokemon-status.sh')]) {
  if (existsSync(f)) {
    renameSync(f, `${f}.bak-uninstall-${ts}`)
    console.log(`${G}✓${R} ${f} sauvegardé`)
  }
}
const skill = join(CLAUDE, 'skills', 'pokemon')
if (existsSync(skill)) {
  renameSync(skill, `${skill}.bak-uninstall-${ts}`)
  console.log(`${G}✓${R} skill pokemon sauvegardé`)
}
const settings = join(CLAUDE, 'settings.json')
if (existsSync(settings)) {
  copyFileSync(settings, `${settings}.bak-uninstall-${ts}`)
  try {
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    delete s.statusLine
    writeFileSync(settings, JSON.stringify(s, null, 2) + '\n')
    console.log(`${G}✓${R} settings.json — statusLine retirée (backup créé)`)
  } catch {
    console.log(`${Y}!${R} settings.json illisible — laissé tel quel (backup créé)`)
  }
}
console.log(`\n${B}Désinstallation terminée.${R} Backups dans ~/.claude/backups/ et suffixe .bak-uninstall-${ts}.`)
