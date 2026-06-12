#!/usr/bin/env node
// claude-pokemon import <file> — restore state.json (Node-native, Phase R3d-5).
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = process.env.HOME || homedir()
const src = process.argv[2]
if (!src) {
  console.error('Usage: npx claude-pokemon import <file>')
  process.exit(1)
}
if (!existsSync(src)) {
  console.error(`Fichier introuvable : ${src}`)
  process.exit(1)
}
try {
  JSON.parse(readFileSync(src, 'utf8'))
} catch {
  console.error(`JSON invalide : ${src}`)
  process.exit(1)
}
const statePath = join(HOME, '.claude', 'pokemon', 'state.json')
if (!existsSync(statePath)) {
  console.error("État introuvable — lance d'abord : npx claude-pokemon install")
  process.exit(1)
}
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
const backup = `${statePath}.bak-${stamp}`
copyFileSync(statePath, backup)
copyFileSync(src, statePath)
console.log(`✓ État restauré depuis : ${src}`)
console.log(`  (ancien état → ${backup})`)
