// Coverage-driving tests for the /pokemon mutating commands: the runCommand
// dispatcher plus the collection / game / trade / misc handler slices. Mirrors
// the CommandInput → CommandResult pattern of commands.test.ts. Asserts on
// structural substrings (ANSI-stripped) and state mutations, not exact bytes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runCommand } from '../src/commands/index.js'
import type { PokemonData, PokemonState, CompanionEntry } from 'claude-pokemon-shared/state-types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8')) as Record<
  string,
  unknown
>
const data = JSON.parse(readFileSync(join(root, 'lib', 'data.default.json'), 'utf8')) as PokemonData

const NOW = '2026-06-11T12:00:00Z'
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

function run(
  name: string,
  state: PokemonState,
  args: string[] = [],
  extra: Record<string, unknown> = {},
) {
  return runCommand({
    name,
    args,
    state,
    data,
    locale: en,
    now: NOW,
    nowEpoch: 0,
    ...extra,
  } as never)
}

function companion(over: Partial<CompanionEntry> = {}): CompanionEntry {
  return {
    lineage: 'fire',
    level: 20,
    total_xp: 0,
    max_stage: 'Charmander',
    evolution_history: [],
    eevee_form: null,
    items: {},
    created_at: NOW,
    completed_at: NOW,
    source: 'hatch',
    ...over,
  } as CompanionEntry
}

describe('runCommand: dispatcher', () => {
  it('returns null for an unknown command', () => {
    expect(run('frobnicate', { team: [] })).toBeNull()
  })

  it('routes each known subcommand to a non-null result', () => {
    const subs = [
      'deposit',
      'withdraw',
      'release',
      'switch',
      'hatch',
      'shiny',
      'reset',
      'give',
      'take',
      'game',
      'trade',
    ]
    for (const sub of subs) {
      const r = runCommand({
        name: sub,
        args: [],
        state: { team: [], pc_storage: [] },
        data,
        locale: en,
        now: NOW,
        nowEpoch: 0,
        decisions: { pool_idx: 0 },
      } as never)
      expect(r, sub).not.toBeNull()
      expect(typeof r!.output).toBe('string')
    }
  })
})

describe('runCommand: switch', () => {
  it('lists the roster with an active companion and team members (no slot arg)', () => {
    const r = run('switch', {
      lineage: 'fire',
      current_level: 30,
      evolution_history: [{ level: 30, name: 'Charmeleon', evolved_at: NOW }],
      team: [companion({ max_stage: 'Bulbasaur' })],
    })!
    expect(r.stateChanged).toBe(false)
    const out = strip(r.output)
    expect(out).toContain('Charmeleon')
    expect(out).toContain('Bulbasaur')
  })

  it('shows the no-active / no-team placeholders when both are empty', () => {
    const r = run('switch', { lineage: '', current_level: 0, team: [] })!
    expect(r.stateChanged).toBe(false)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })

  it('rejects an out-of-range slot', () => {
    const r = run('switch', { lineage: 'fire', current_level: 30, team: [companion()] }, ['9'])!
    expect(r.stateChanged).toBe(false)
    expect(r.state.lineage).toBe('fire')
  })

  it('renders a shiny team entry that falls back to evolution_history + lineage label', () => {
    const r = run('switch', {
      lineage: 'fire',
      current_level: 30,
      evolution_history: [{ level: 30, name: 'Charmeleon', evolved_at: NOW }],
      team: [
        companion({
          is_shiny: true,
          max_stage: undefined,
          lineage: 'unknown-lineage',
          evolution_history: [{ level: 5, name: 'Caterpie', evolved_at: NOW }],
        }),
      ],
    })!
    expect(r.stateChanged).toBe(false)
    const out = strip(r.output)
    expect(out).toContain('★')
    expect(out).toContain('Caterpie')
    expect(out).toContain('unknown-lineage')
  })

  it('swaps the active companion with a valid team slot', () => {
    const r = run(
      'switch',
      {
        lineage: 'fire',
        current_level: 30,
        evolution_history: [{ level: 30, name: 'Charmeleon', evolved_at: NOW }],
        team: [companion({ max_stage: 'Bulbasaur', lineage: 'chikorita' })],
      },
      ['0'],
    )!
    expect(r.stateChanged).toBe(true)
    expect(r.state.lineage).toBe('chikorita')
  })
})

describe('runCommand: hatch', () => {
  it('starts a random egg and archives the current companion', () => {
    const r = run('hatch', {
      lineage: 'fire',
      current_level: 30,
      evolution_history: [{ level: 30, name: 'Charmeleon', evolved_at: NOW }],
      team: [],
    })!
    expect(r.stateChanged).toBe(true)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })

  it('rejects an unknown lineage target and lists available ones', () => {
    const r = run('hatch', { lineage: '', current_level: 0 }, ['notalineage'])!
    expect(r.stateChanged).toBe(false)
    const lineages = Object.keys(data.lineages ?? {})
    expect(strip(r.output)).toContain(lineages.sort()[0])
  })

  it('accepts a valid lineage target', () => {
    const target = Object.keys(data.lineages ?? {})[0]!
    const r = run('hatch', { lineage: '', current_level: 0 }, [target])!
    expect(r.stateChanged).toBe(true)
  })
})

describe('runCommand: deposit', () => {
  it('shows usage when no slot is given', () => {
    const r = run('deposit', { team: [companion()] })!
    expect(r.stateChanged).toBe(false)
  })

  it('reports an empty team', () => {
    const r = run('deposit', { team: [] }, ['0'])!
    expect(r.stateChanged).toBe(false)
  })

  it('rejects an out-of-range slot', () => {
    const r = run('deposit', { team: [companion()] }, ['5'])!
    expect(r.stateChanged).toBe(false)
  })

  it('moves a team member to the PC', () => {
    const r = run('deposit', { team: [companion({ max_stage: 'Squirtle' })], pc_storage: [] }, [
      '0',
    ])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.team).toHaveLength(0)
    expect(r.state.pc_storage).toHaveLength(1)
    expect(strip(r.output)).toContain('Squirtle')
  })

  it('falls back to the egg label for an entry with no name', () => {
    const r = run('deposit', { team: [companion({ max_stage: undefined })], pc_storage: [] }, [
      '0',
    ])!
    expect(r.stateChanged).toBe(true)
    expect(strip(r.output)).toContain('Œuf')
  })
})

describe('runCommand: withdraw', () => {
  it('shows usage when no slot is given', () => {
    const r = run('withdraw', { pc_storage: [companion()] })!
    expect(r.stateChanged).toBe(false)
  })

  it('reports an empty PC', () => {
    const r = run('withdraw', { pc_storage: [] }, ['0'])!
    expect(r.stateChanged).toBe(false)
  })

  it('rejects an out-of-range slot', () => {
    const r = run('withdraw', { pc_storage: [companion()] }, ['9'])!
    expect(r.stateChanged).toBe(false)
  })

  it('reports a full team', () => {
    const six = Array.from({ length: 6 }, () => companion())
    const r = run(
      'withdraw',
      { lineage: 'fire', current_level: 30, team: six, pc_storage: [companion()] },
      ['0'],
    )!
    expect(r.stateChanged).toBe(false)
  })

  it('withdraws a PC member into the team', () => {
    const r = run(
      'withdraw',
      {
        lineage: 'fire',
        current_level: 30,
        team: [],
        pc_storage: [companion({ max_stage: 'Onix' })],
      },
      ['0'],
    )!
    expect(r.stateChanged).toBe(true)
    expect(strip(r.output)).toContain('Onix')
  })
})

describe('runCommand: release', () => {
  it('shows usage with missing args', () => {
    expect(run('release', { team: [] }, [])!.stateChanged).toBe(false)
    expect(run('release', { team: [] }, ['team'])!.stateChanged).toBe(false)
  })

  it('shows usage for an invalid area', () => {
    const r = run('release', { team: [companion()] }, ['bag', '0', '--confirm'])!
    expect(r.stateChanged).toBe(false)
  })

  it('reports an empty list for the chosen area', () => {
    expect(run('release', { team: [] }, ['team', '0', '--confirm'])!.stateChanged).toBe(false)
    expect(run('release', { pc_storage: [] }, ['pc', '0', '--confirm'])!.stateChanged).toBe(false)
  })

  it('rejects an out-of-range slot', () => {
    const r = run('release', { team: [companion()] }, ['team', '7', '--confirm'])!
    expect(r.stateChanged).toBe(false)
  })

  it('requires --confirm before releasing', () => {
    const r = run('release', { team: [companion({ max_stage: 'Rattata' })] }, ['team', '0'])!
    expect(r.stateChanged).toBe(false)
    expect(strip(r.output)).toContain('Rattata')
  })

  it('releases a confirmed slot from the team', () => {
    const r = run('release', { team: [companion()] }, ['team', '0', '--confirm'])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.team).toHaveLength(0)
  })

  it('releases a confirmed slot from the PC', () => {
    const r = run('release', { pc_storage: [companion()] }, ['pc', '0', '--confirm'])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.pc_storage).toHaveLength(0)
  })
})

describe('runCommand: game', () => {
  const withQuiz = (id: string): PokemonState => ({
    lineage: 'fire',
    current_level: 10,
    current_quiz: { id, started_at: NOW },
  })

  it('shows help', () => {
    const r = run('game', { lineage: 'fire', current_level: 10 }, ['help'])!
    expect(r.stateChanged).toBe(false)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })

  it('refuses to play without an active companion', () => {
    const r = run('game', { lineage: '', current_level: 0 }, [])!
    expect(r.stateChanged).toBe(false)
  })

  it('starts a fresh quiz (empty input, no current quiz)', () => {
    const r = run('game', { lineage: 'fire', current_level: 10 }, [], {
      decisions: { pool_idx: 0 },
    })!
    expect(r.stateChanged).toBe(true)
    expect(r.state.current_quiz?.id).toBe(data.wild_pool?.[0]?.id)
    const out = strip(r.output)
    expect(out).toContain(data.wild_pool?.[0]?.type ?? '')
  })

  it('shows the hints again when a quiz is already in progress', () => {
    const id = data.wild_pool?.[0]?.id ?? 'bulbasaur'
    const r = run('game', withQuiz(id), [])!
    expect(r.stateChanged).toBe(false)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })

  it('honors the cooldown when recently completed', () => {
    const last = '2026-06-11T11:55:00Z'
    const nowEpoch = Math.floor(Date.parse(NOW) / 1000)
    const r = run(
      'game',
      { lineage: 'fire', current_level: 10, last_game_completed_at: last },
      [],
      { nowEpoch, decisions: { pool_idx: 0 } },
    )!
    expect(r.stateChanged).toBe(false)
  })

  it('starts a new quiz once the cooldown has elapsed', () => {
    const last = '2026-06-11T00:00:00Z'
    const nowEpoch = Math.floor(Date.parse(NOW) / 1000)
    const r = run(
      'game',
      { lineage: 'fire', current_level: 10, last_game_completed_at: last },
      [],
      { nowEpoch, decisions: { pool_idx: 0 } },
    )!
    expect(r.stateChanged).toBe(true)
    expect(r.state.current_quiz).toBeDefined()
  })

  it('skips an active quiz', () => {
    const id = data.wild_pool?.[0]?.id ?? 'bulbasaur'
    const r = run('game', withQuiz(id), ['skip'])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.current_quiz).toBeUndefined()
  })

  it('reports nothing to skip when no quiz is active', () => {
    const r = run('game', { lineage: 'fire', current_level: 10 }, ['skip'])!
    expect(r.stateChanged).toBe(false)
  })

  it('rejects an answer when no quiz is active', () => {
    const r = run('game', { lineage: 'fire', current_level: 10 }, ['Pikachu'])!
    expect(r.stateChanged).toBe(false)
  })

  it('awards XP for a correct answer (diacritics/case insensitive)', () => {
    const w = data.wild_pool?.[0]!
    const id = w.id!
    const name = (w as unknown as Record<string, string>)['name_' + (data.language ?? 'fr')]!
    const r = run('game', { ...withQuiz(id), total_xp: 0, friendship: 0 }, [name.toUpperCase()])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.current_quiz).toBeUndefined()
    expect(r.state.total_xp ?? 0).toBeGreaterThan(0)
    expect(r.state.lifetime_stats?.games_won).toBe(1)
    expect(r.state.lifetime_stats?.games_played).toBe(1)
    expect(r.state.last_game_completed_at).toBe(NOW)
  })

  it('reveals the answer for a wrong guess', () => {
    const id = data.wild_pool?.[0]?.id ?? 'bulbasaur'
    const r = run('game', withQuiz(id), ['definitely-wrong'])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.lifetime_stats?.games_won ?? 0).toBe(0)
    expect(r.state.lifetime_stats?.games_played).toBe(1)
    expect(r.state.current_quiz).toBeUndefined()
  })

  it('treats an answer for an unknown quiz id as wrong (expected resolves empty)', () => {
    const r = run('game', withQuiz('no-such-id'), ['anything'])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.lifetime_stats?.games_played).toBe(1)
  })

  it('treats an unparseable last-completed timestamp as no cooldown', () => {
    const r = run(
      'game',
      { lineage: 'fire', current_level: 10, last_game_completed_at: 'not-a-date' },
      [],
      { nowEpoch: Math.floor(Date.parse(NOW) / 1000), decisions: { pool_idx: 0 } },
    )!
    expect(r.stateChanged).toBe(true)
    expect(r.state.current_quiz).toBeDefined()
  })
})

describe('runCommand: trade give / take', () => {
  it('shows usage for give with no item id', () => {
    const r = run('give', { items: {} }, [])!
    expect(r.stateChanged).toBe(false)
  })

  it('reports an empty inventory for give', () => {
    const r = run('give', { items: {} }, ['oran_berry'])!
    expect(r.stateChanged).toBe(false)
  })

  it('rejects a non-holdable item', () => {
    const id =
      Object.entries(data.items ?? {}).find(([, v]) => v?.holdable !== true)?.[0] ?? 'fire_stone'
    const r = run('give', { items: { [id]: 2 } }, [id])!
    expect(r.stateChanged).toBe(false)
  })

  it('equips a holdable item and decrements the inventory', () => {
    const id =
      Object.entries(data.items ?? {}).find(([, v]) => v?.holdable === true)?.[0] ?? 'oran_berry'
    const r = run('give', { items: { [id]: 1 } }, [id])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.held_item).toBe(id)
    expect(r.state.items?.[id]).toBeUndefined()
  })

  it('reports no held item for take', () => {
    const r = run('take', { held_item: null }, [])!
    expect(r.stateChanged).toBe(false)
  })

  it('unequips the held item back to the inventory', () => {
    const r = run('take', { held_item: 'oran_berry', items: { oran_berry: 0 } }, [])!
    expect(r.stateChanged).toBe(true)
    expect(r.state.held_item).toBeNull()
    expect(r.state.items?.oran_berry).toBe(1)
  })
})

describe('runCommand: trade pull guards', () => {
  it('renders an empty species name when the locale column is missing', () => {
    const r = runCommand({
      name: 'trade',
      args: ['Ash'],
      state: { team: [], pc_storage: [] },
      data: { ...data, language: 'de' },
      locale: en,
      now: NOW,
      nowEpoch: 0,
      decisions: { pool_idx: 0, trade_level: 12, trade_shiny: true },
    } as never)!
    expect(r.stateChanged).toBe(true)
    expect(r.state.team).toHaveLength(1)
    expect(r.state.team![0]!.is_shiny).toBe(true)
    expect(strip(r.output)).toContain('★')
  })
})

describe('runCommand: misc shiny / reset', () => {
  it('toggles shiny on', () => {
    const r = run('shiny', { is_shiny: false })!
    expect(r.stateChanged).toBe(true)
    expect(r.state.is_shiny).toBe(true)
    expect(strip(r.output)).toContain('true')
  })

  it('toggles shiny off', () => {
    const r = run('shiny', { is_shiny: true })!
    expect(r.state.is_shiny).toBe(false)
    expect(strip(r.output)).toContain('false')
  })

  it('refuses to reset with no active companion', () => {
    const r = run('reset', { lineage: '', current_level: 0 })!
    expect(r.stateChanged).toBe(false)
  })

  it('performs a ceremonial reset on an active companion', () => {
    const r = run('reset', {
      lineage: 'fire',
      current_level: 30,
      evolution_history: [{ level: 30, name: 'Charmeleon', evolved_at: NOW }],
    })!
    expect(r.stateChanged).toBe(true)
    expect(strip(r.output).length).toBeGreaterThan(0)
  })
})
