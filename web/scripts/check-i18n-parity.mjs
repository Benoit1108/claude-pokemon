#!/usr/bin/env node
// Validates that i18n/locales/fr.json and en.json have **identical key paths**.
// CI gate — a missing translation in either locale would fall back at runtime
// and surface untranslated strings to users.
//
// Exits 0 if all keys match, 1 otherwise (with a diff report).

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FR = JSON.parse(readFileSync(resolve(__dirname, '..', 'i18n', 'locales', 'fr.json'), 'utf8'))
const EN = JSON.parse(readFileSync(resolve(__dirname, '..', 'i18n', 'locales', 'en.json'), 'utf8'))

// Recursively collect all leaf key paths (dot-separated). Skips the _meta
// node since its content is locale-specific by design.
function leafPaths(obj, prefix = '') {
  if (obj === null || typeof obj !== 'object') return [prefix]
  return Object.entries(obj).flatMap(([k, v]) => {
    if (prefix === '' && k === '_meta') return []
    const next = prefix ? `${prefix}.${k}` : k
    return leafPaths(v, next)
  })
}

const fr = new Set(leafPaths(FR))
const en = new Set(leafPaths(EN))

const missingInEn = [...fr].filter(k => !en.has(k)).sort()
const missingInFr = [...en].filter(k => !fr.has(k)).sort()

if (missingInEn.length === 0 && missingInFr.length === 0) {
  console.log(`✓ i18n parity OK (${fr.size} keys per locale)`)
  process.exit(0)
}

if (missingInEn.length) {
  console.error(`\n✗ Missing in en.json (${missingInEn.length}) :`)
  missingInEn.forEach(k => console.error(`    ${k}`))
}
if (missingInFr.length) {
  console.error(`\n✗ Missing in fr.json (${missingInFr.length}) :`)
  missingInFr.forEach(k => console.error(`    ${k}`))
}
process.exit(1)
