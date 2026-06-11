// Collection-transform parity (Phase R3d-2): assert the TS transforms reproduce
// the bash jq functions exactly, using tests/golden/fixtures/state_transforms.jsonl
// as the contract (captured by tests/golden/capture-state.sh).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  activeToArchive,
  resetActive,
  loadTeamToActive,
  teamToPc,
  pcToTeamOrActive,
  releaseSlot,
  checkBadges,
} from '../src/collection.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const fixture = join(root, 'tests', 'golden', 'fixtures', 'state_transforms.jsonl')
const data = JSON.parse(readFileSync(join(root, 'lib', 'data.default.json'), 'utf8'))

interface Case {
  fn: string
  args: unknown[]
  now: string
  input: Record<string, unknown>
  output: Record<string, unknown> | null
}

const cases: Case[] = readFileSync(fixture, 'utf8')
  .trim()
  .split('\n')
  .map((l) => JSON.parse(l) as Case)

function run(c: Case): unknown {
  switch (c.fn) {
    case 'active_to_archive':
      return activeToArchive(c.input, c.now)
    case 'reset_active':
      return resetActive(c.input, c.now, c.args[0] as string | undefined)
    case 'load_team_to_active':
      return loadTeamToActive(c.input, c.now, c.args[0] as number)
    case 'team_to_pc':
      return teamToPc(c.input, c.args[0] as number)
    case 'pc_to_team_or_active':
      return pcToTeamOrActive(c.input, c.now, c.args[0] as number)
    case 'release_slot':
      return releaseSlot(c.input, c.args[0] as string, c.args[1] as number)
    case 'check_badges':
      return checkBadges(c.input, c.now, data)
    default:
      throw new Error(`unknown fn ${c.fn}`)
  }
}

describe('collection transforms — parity with the bash jq functions', () => {
  it('has fixtures', () => expect(cases.length).toBeGreaterThanOrEqual(13))

  for (const [i, c] of cases.entries()) {
    it(`${c.fn} #${i} (args=${JSON.stringify(c.args)})`, () => {
      expect(run(c)).toEqual(c.output)
    })
  }

  it('does not mutate the input state', () => {
    const c = cases.find((x) => x.fn === 'active_to_archive' && Array.isArray(x.input.team))!
    const before = JSON.stringify(c.input)
    run(c)
    expect(JSON.stringify(c.input)).toBe(before)
  })
})
