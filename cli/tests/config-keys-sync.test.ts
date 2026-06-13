// CONFIG_KEYS lives in 3 places (entry-io.ts = source of truth, + the two
// standalone bin/*.mjs installers that can't import TS). This guards them
// against drift — extract each array literal textually and assert equality.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { CONFIG_KEYS } from '../src/entry-io.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

// Pull the first `CONFIG_KEYS = [ ... ]` array literal out of a source file
// and return its string entries.
function extractKeys(relPath: string): string[] {
  const src = readFileSync(join(repoRoot, relPath), 'utf8')
  const m = /CONFIG_KEYS\s*=\s*\[([\s\S]*?)\]/.exec(src)
  if (!m) throw new Error(`CONFIG_KEYS array not found in ${relPath}`)
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
}

describe('CONFIG_KEYS stays in sync across the 3 declarations', () => {
  it('bin/install.mjs matches the source of truth', () => {
    expect(extractKeys('bin/install.mjs')).toEqual([...CONFIG_KEYS])
  })
  it('bin/update.mjs matches the source of truth', () => {
    expect(extractKeys('bin/update.mjs')).toEqual([...CONFIG_KEYS])
  })
})
