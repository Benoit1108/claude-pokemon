#!/usr/bin/env node
// Native Node health check (Phase R3d-5). Windows-native equivalent of
// bin/status.sh: reports the install's files + the statusLine registration.
// No bash / jq.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = process.env.HOME || homedir()
const CLAUDE = join(HOME, '.claude')
const TARGET = join(CLAUDE, 'pokemon')
const B = '\x1b[1m', R = '\x1b[0m', G = '\x1b[32m', E = '\x1b[31m', D = '\x1b[2m'

console.log(`\n${B}claude-pokemon — état de l’installation${R}\n`)

console.log(`${B}Fichiers :${R}`)
const files = [
  join(TARGET, 'data.json'),
  join(TARGET, 'state.json'),
  join(TARGET, 'statusline.mjs'),
  join(TARGET, 'pokemon.mjs'),
  join(TARGET, 'locales', 'fr.json'),
  join(CLAUDE, 'skills', 'pokemon', 'SKILL.md'),
  join(CLAUDE, 'settings.json'),
]
for (const f of files) {
  const mark = existsSync(f) ? `${G}✓${R}` : `${E}✗${R}`
  console.log(`  ${mark} ${f.replace(HOME, '~')}`)
}

const spritesOk = existsSync(join(TARGET, 'sprites', 'normal', 'charmander.txt'))
console.log(`  ${spritesOk ? `${G}✓${R}` : `${E}✗${R}`} sprites pré-rendus`)

console.log(`\n${B}statusLine :${R}`)
const settings = join(CLAUDE, 'settings.json')
if (existsSync(settings)) {
  try {
    const s = JSON.parse(readFileSync(settings, 'utf8'))
    const cmd = s.statusLine?.command
    if (cmd) console.log(`  ${G}✓${R} ${D}${cmd}${R}`)
    else console.log(`  ${E}✗${R} aucune statusLine configurée`)
  } catch {
    console.log(`  ${E}✗${R} settings.json illisible`)
  }
} else {
  console.log(`  ${E}✗${R} ~/.claude/settings.json absent`)
}

if (existsSync(join(TARGET, 'state.json'))) {
  try {
    const st = JSON.parse(readFileSync(join(TARGET, 'state.json'), 'utf8'))
    console.log(`\n${B}Compagnon :${R} ${D}lineage=${st.lineage ?? 'œuf'} · Lv.${st.current_level ?? 0} · XP=${st.total_xp ?? 0}${R}`)
  } catch {
    // ignore
  }
}
console.log()
