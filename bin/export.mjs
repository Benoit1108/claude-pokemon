#!/usr/bin/env node
// claude-pokemon export <file> — backup state.json (Node-native, Phase R3d-5).
import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const HOME = process.env.HOME || homedir()
const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
const out = process.argv[2] || `pokemon-backup-${stamp}.json`
const statePath = join(HOME, '.claude', 'pokemon', 'state.json')
if (!existsSync(statePath)) {
  console.error("État introuvable — lance d'abord : npx claude-pokemon install")
  process.exit(1)
}
copyFileSync(statePath, out)
console.log(`✓ État sauvegardé dans : ${out}`)
