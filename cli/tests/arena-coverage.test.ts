// runArena dispatcher + every subcommand handler (Phase coverage). The real
// HTTP fetch is mocked per-call; the arena_secret FILE op is returned as a
// signal, never touched on disk. Asserts on structural substrings (EN locale
// values) + state/data mutation flags, not frozen bytes.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runArena, buildTeam, renderBattle, applyTrainerToState } from '../src/arena.js'
import type { ArenaInput } from '../src/arena.js'
import type { Locale } from '../src/render/i18n.js'
import type { PokemonData, PokemonState } from 'claude-pokemon-shared/state-types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8')) as Locale
const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

afterEach(() => vi.unstubAllGlobals())

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  const queue = [...responses]
  const fn = vi.fn(async () => queue.shift() ?? jsonResponse({}))
  vi.stubGlobal('fetch', fn)
  return fn
}

const baseState: PokemonState = {
  lineage: 'fire',
  current_level: 40,
  is_shiny: false,
  total_xp: 1000,
}

function makeInput(over: Partial<ArenaInput> = {}): ArenaInput {
  const data: PokemonData = over.data ?? {
    stats_share: {
      enabled: true,
      anon_id: 'abcd1234',
      endpoint: 'https://api',
      display_name: 'Sacha',
    },
    arena: { enabled: true, web_url: 'https://web' },
  }
  return {
    args: over.args ?? ['status'],
    data,
    state: over.state ?? baseState,
    locale: over.locale ?? en,
    arenaSecret: over.arenaSecret ?? 'sek',
    now: over.now ?? '2026-06-12T12:00:00Z',
  }
}

describe('buildTeam', () => {
  it('returns a team with display_name when active', () => {
    const team = buildTeam(baseState, 'abcd', 'Sacha')
    expect(team).toEqual({
      anon_id: 'abcd',
      lineage: 'fire',
      level: 40,
      is_shiny: false,
      display_name: 'Sacha',
    })
  })
  it('omits display_name when empty', () => {
    expect(buildTeam(baseState, 'abcd', '')).toEqual({
      anon_id: 'abcd',
      lineage: 'fire',
      level: 40,
      is_shiny: false,
    })
  })
  it('null when no lineage or level < 1', () => {
    expect(buildTeam({ ...baseState, lineage: '' }, 'a', '')).toBeNull()
    expect(buildTeam({ ...baseState, current_level: 0 }, 'a', '')).toBeNull()
  })
})

describe('renderBattle', () => {
  it('renders challenger win with turn log + effectiveness + crit', () => {
    const out = strip(
      renderBattle(en, {
        challenger: { display_name: 'Me', lineage: 'fire', level: 40, is_shiny: true },
        defender: { anon_id: 'rival', lineage: 'water', level: 38 },
        turns: [
          { turn: 1, actor: 'challenger', effectiveness: 2, damage: 50, critical: true },
          { turn: 2, actor: 'defender', effectiveness: 0.5, damage: 10 },
          { turn: 3, actor: 'challenger', effectiveness: 1, damage: 20 },
        ],
        winner: 'challenger',
        reason: 'ko',
      }),
    )
    expect(out).toContain('Me')
    expect(out).toContain('rival')
    expect(out).toContain('2.0×')
    expect(out).toContain('0.5×')
    expect(out).toContain('CRIT!')
    expect(out).toContain('Me wins!')
    expect(out).toContain('3 turns, ended by ko')
  })
  it('renders defender win (nested .battle)', () => {
    const out = strip(
      renderBattle(en, { battle: { defender: { display_name: 'D' }, winner: 'defender' } }),
    )
    expect(out).toContain('D wins!')
  })
  it('renders a draw', () => {
    const out = strip(renderBattle(en, { winner: 'tie' }))
    expect(out).toContain('Draw')
  })
})

describe('applyTrainerToState', () => {
  it('rewrites state from a trainer response with fallbacks', () => {
    const s = applyTrainerToState(
      baseState,
      {
        stats: {
          active: { lineage: 'water', is_shiny: true, current_level: 10 },
          lifetime: {
            total_tokens: 99,
            total_compagnons: 3,
            lineages_completed: ['fire'],
            games_won: 2,
            games_played: 5,
          },
          badges: ['boulder'],
          pokedex_seen_ids: ['25', '6'],
        },
      },
      '2026-06-12T12:00:00Z',
    )
    expect(s.lineage).toBe('water')
    expect(s.is_shiny).toBe(true)
    expect(s.current_level).toBe(10)
    expect(s.lifetime_stats!.total_tokens).toBe(99)
    expect(s.lifetime_stats!.total_companions).toBe(3)
    expect(s.badges).toEqual([{ id: 'boulder', earned_at: '2026-06-12T12:00:00Z' }])
    expect(s.pokedex_wild!['25']).toEqual({ count: 1, first_seen_at: '2026-06-12T12:00:00Z' })
  })
  it('applies defaults when stats absent', () => {
    const s = applyTrainerToState(baseState, {}, '2026-06-12T12:00:00Z')
    expect(s.lifetime_stats!.total_tokens).toBe(0)
    expect(s.badges).toEqual([])
    expect(s.pokedex_wild).toEqual({})
  })
})

describe('runArena: status', () => {
  it('shows enabled status without network', async () => {
    const fn = stubFetch()
    const r = await runArena(makeInput({ args: ['status'] }))
    expect(r).not.toBeNull()
    expect(strip(r!.output)).toContain('Enabled — anon_id: abcd1234')
    expect(fn).not.toHaveBeenCalled()
  })
  it('shows disabled status', async () => {
    stubFetch()
    const r = await runArena(
      makeInput({
        args: [],
        data: {
          stats_share: { endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('Disabled.')
  })
})

describe('runArena: enable', () => {
  it('guards: no anon_id', async () => {
    const r = await runArena(
      makeInput({
        args: ['enable', '--confirm'],
        data: {
          stats_share: { endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('No anon_id yet')
  })
  it('guards: already enabled', async () => {
    const r = await runArena(makeInput({ args: ['enable'] }))
    expect(strip(r!.output)).toContain('Already enabled')
  })
  it('guards: no --confirm shows privacy notice', async () => {
    const r = await runArena(
      makeInput({
        args: ['enable'],
        data: {
          stats_share: { anon_id: 'a', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('What gets sent')
  })
  it('guards: no active companion', async () => {
    const r = await runArena(
      makeInput({
        args: ['enable', '--confirm'],
        state: { ...baseState, lineage: '' },
        data: {
          stats_share: { anon_id: 'a', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('No active companion')
  })
  it('success: saves secret + sets enabled', async () => {
    stubFetch(jsonResponse({ arena_secret: 'newsek' }))
    const r = await runArena(
      makeInput({
        args: ['enable', '--confirm'],
        data: {
          stats_share: { anon_id: 'abcd', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(r!.secret).toEqual({ action: 'save', value: 'newsek' })
    expect(r!.dataChanged).toBe(true)
    expect(r!.data.arena!.enabled).toBe(true)
    expect(strip(r!.output)).toContain('Arena enabled')
  })
  it('failure: validation error joins details', async () => {
    stubFetch(jsonResponse({ error: 'validation', details: ['bad level', 'bad lineage'] }, 400))
    const r = await runArena(
      makeInput({
        args: ['on', '--confirm'],
        data: {
          stats_share: { anon_id: 'abcd', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('bad level; bad lineage')
  })
  it('failure: already_enabled error code', async () => {
    stubFetch(jsonResponse({ error: 'already_enabled' }, 409))
    const r = await runArena(
      makeInput({
        args: ['enable', '--confirm'],
        data: {
          stats_share: { anon_id: 'abcd', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('Already enabled')
  })
  it('failure: empty error → network failure description', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))),
    )
    const r = await runArena(
      makeInput({
        args: ['enable', '--confirm'],
        data: {
          stats_share: { anon_id: 'abcd', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('ECONNREFUSED')
  })
  it('failure: other error code echoed', async () => {
    stubFetch(jsonResponse({ error: 'rate_limited' }, 429))
    const r = await runArena(
      makeInput({
        args: ['enable', '--confirm'],
        data: {
          stats_share: { anon_id: 'abcd', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('rate_limited')
  })
})

describe('runArena: disable', () => {
  it('guards: already disabled', async () => {
    const r = await runArena(
      makeInput({
        args: ['disable'],
        data: {
          stats_share: { anon_id: 'a', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('Already disabled')
  })
  it('guards: no secret', async () => {
    const r = await runArena(makeInput({ args: ['off'], arenaSecret: '' }))
    expect(strip(r!.output)).toContain('secret missing')
  })
  it('success: clears secret', async () => {
    stubFetch(jsonResponse({}))
    const r = await runArena(makeInput({ args: ['disable'] }))
    expect(r!.secret).toEqual({ action: 'clear' })
    expect(r!.data.arena!.enabled).toBe(false)
    expect(strip(r!.output)).toContain('Disabled. Local secret cleared')
  })
})

describe('runArena: regenerate', () => {
  it('guards: not enabled / no secret / no active', async () => {
    const a = await runArena(
      makeInput({
        args: ['regenerate'],
        data: {
          stats_share: { anon_id: 'a', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(a!.output)).toContain('Arena not enabled')
    const b = await runArena(makeInput({ args: ['rotate'], arenaSecret: '' }))
    expect(strip(b!.output)).toContain('secret missing')
    const c = await runArena(
      makeInput({ args: ['regenerate'], state: { ...baseState, lineage: '' } }),
    )
    expect(strip(c!.output)).toContain('No active companion')
  })
  it('success: rotates secret', async () => {
    stubFetch(jsonResponse({ arena_secret: 'rotated' }))
    const r = await runArena(makeInput({ args: ['regenerate'] }))
    expect(r!.secret).toEqual({ action: 'save', value: 'rotated' })
    expect(strip(r!.output)).toContain('Secret rotated')
  })
  it('failure: describes body', async () => {
    stubFetch(jsonResponse({ error: 'nope' }, 500))
    const r = await runArena(makeInput({ args: ['regenerate'] }))
    expect(strip(r!.output)).toContain('Regenerate failed')
  })
})

describe('runArena: opponents', () => {
  it('fetch failed (non-2xx → null)', async () => {
    stubFetch(jsonResponse({}, 500))
    const r = await runArena(makeInput({ args: ['opponents'] }))
    expect(strip(r!.output)).toContain('unreachable')
  })
  it('lists opponents with shiny mark', async () => {
    stubFetch(
      jsonResponse({
        total: 2,
        opponents: [
          { anon_id: 'z1', lineage: 'water', level: 30, display_name: 'Rival', is_shiny: true },
          { anon_id: 'z2', lineage: 'grass', level: 5 },
        ],
      }),
    )
    const r = await runArena(makeInput({ args: ['list', '5'] }))
    const out = strip(r!.output)
    expect(out).toContain('2 trainers')
    expect(out).toContain('Rival')
    expect(out).toContain('★')
    expect(out).toContain('z2')
  })
})

describe('runArena: challenge', () => {
  it('guards: usage / not enabled / no secret', async () => {
    const a = await runArena(makeInput({ args: ['challenge'] }))
    expect(strip(a!.output)).toContain('Usage')
    const b = await runArena(
      makeInput({
        args: ['challenge', 'x'],
        data: {
          stats_share: { anon_id: 'a', endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(b!.output)).toContain('Arena not enabled')
    const c = await runArena(makeInput({ args: ['challenge', 'x'], arenaSecret: '' }))
    expect(strip(c!.output)).toContain('secret missing')
  })
  it('success: renders battle + stores last_battle_id', async () => {
    stubFetch(
      jsonResponse({
        battle: {
          battle_id: 'b99',
          winner: 'challenger',
          challenger: { display_name: 'Me' },
          defender: { display_name: 'You' },
          turns: [],
          reason: 'ko',
        },
      }),
    )
    const r = await runArena(makeInput({ args: ['fight', 'rival'] }))
    expect(r!.data.arena!.last_battle_id).toBe('b99')
    expect(r!.dataChanged).toBe(true)
    expect(strip(r!.output)).toContain('Replay: https://web/battle/b99')
  })
  it('failure: no battle id', async () => {
    stubFetch(jsonResponse({ error: 'busy' }, 409))
    const r = await runArena(makeInput({ args: ['challenge', 'rival'] }))
    expect(strip(r!.output)).toContain('Challenge failed')
  })
})

describe('runArena: battle', () => {
  it('usage when no id and no last battle', async () => {
    const r = await runArena(
      makeInput({
        args: ['battle'],
        data: {
          stats_share: { anon_id: 'a', endpoint: 'https://api' },
          arena: { enabled: true },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('Usage')
  })
  it('not found', async () => {
    stubFetch(jsonResponse({}, 404))
    const r = await runArena(makeInput({ args: ['battle', 'missing'] }))
    expect(strip(r!.output)).toContain('Battle not found: missing')
  })
  it('renders a found battle (using last_battle_id)', async () => {
    stubFetch(
      jsonResponse({
        winner: 'defender',
        defender: { display_name: 'Foe' },
        turns: [],
        reason: 'ko',
      }),
    )
    const r = await runArena(
      makeInput({
        args: ['view'],
        data: {
          stats_share: { anon_id: 'a', endpoint: 'https://api' },
          arena: { enabled: true, last_battle_id: 'last1', web_url: 'https://web' },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('Replay: https://web/battle/last1')
  })
})

describe('runArena: pair', () => {
  it('guards: not enabled', async () => {
    const r = await runArena(
      makeInput({
        args: ['pair'],
        data: {
          stats_share: { endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('Arena not enabled')
  })
  it('guards: no secret', async () => {
    const r = await runArena(makeInput({ args: ['pair'], arenaSecret: '' }))
    expect(strip(r!.output)).toContain('secret missing')
  })
  it('failure: no code', async () => {
    stubFetch(jsonResponse({ error: 'nope' }, 500))
    const r = await runArena(makeInput({ args: ['pair'] }))
    expect(strip(r!.output)).toContain('Pairing failed')
  })
  it('success: prints code + url + expiry (qr hint when qrencode absent)', async () => {
    stubFetch(jsonResponse({ code: 'ABCDEF', expires_at: '2026-06-12T12:05:00Z' }))
    const r = await runArena(makeInput({ args: ['pair'] }))
    const out = strip(r!.output)
    expect(out).toContain('ABCDEF')
    expect(out).toContain('https://web/pair?code=ABCDEF')
    expect(out).toContain('Expires at')
  })
})

describe('runArena: link', () => {
  it('usage when no code', async () => {
    const r = await runArena(makeInput({ args: ['link'] }))
    expect(strip(r!.output)).toContain('Usage')
  })
  it('invalid code', async () => {
    const r = await runArena(makeInput({ args: ['link', 'abc'] }))
    expect(strip(r!.output)).toContain('Invalid code')
  })
  it('failure: redeem returns no anon/secret (with warn_existing)', async () => {
    stubFetch(jsonResponse({ error: 'expired' }, 410))
    const r = await runArena(makeInput({ args: ['link', 'ABCDEF'] }))
    const out = strip(r!.output)
    expect(out).toContain('already have a CLI account')
    expect(out).toContain('Link failed')
  })
  it('success: redeem + trainer sync', async () => {
    stubFetch(
      jsonResponse({ anon_id: 'newanon', arena_secret: 'newsek' }),
      jsonResponse({
        stats: { active: { lineage: 'water', current_level: 5 }, lifetime: { total_tokens: 10 } },
      }),
    )
    const r = await runArena(
      makeInput({
        args: ['link', 'abcdef'],
        data: {
          stats_share: { endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(r!.secret).toEqual({ action: 'save', value: 'newsek' })
    expect(r!.data.stats_share!.anon_id).toBe('newanon')
    expect(r!.stateChanged).toBe(true)
    expect(r!.state.lineage).toBe('water')
    expect(strip(r!.output)).toContain('synced from the web account')
    expect(strip(r!.output)).toContain('CLI linked to account newanon')
  })
  it('success: redeem but no remote state', async () => {
    stubFetch(jsonResponse({ anon_id: 'newanon', arena_secret: 'newsek' }), jsonResponse({}, 404))
    const r = await runArena(
      makeInput({
        args: ['link', 'ABCDEF'],
        data: {
          stats_share: { endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(r!.stateChanged).toBe(false)
    expect(strip(r!.output)).toContain('no submit yet')
  })
})

describe('runArena: live delegation', () => {
  it('not enabled gate', async () => {
    const r = await runArena(
      makeInput({
        args: ['live', 'status'],
        data: {
          stats_share: { endpoint: 'https://api' },
          arena: { enabled: false },
        } as PokemonData,
      }),
    )
    expect(strip(r!.output)).toContain('Arena not enabled')
    expect(r!.secret).toBeNull()
  })
  it('no secret gate', async () => {
    const r = await runArena(makeInput({ args: ['live', 'status'], arenaSecret: '' }))
    expect(strip(r!.output)).toContain('secret missing')
  })
  it('delegates to runLive and merges output', async () => {
    stubFetch(
      jsonResponse({
        state: 'active',
        turn_no: 1,
        challenger: { anon_id: 'abcd1234', snapshot: { lineage: 'fire', level: 40 }, hp: 100 },
        defender: { anon_id: 'foe', snapshot: { lineage: 'water', level: 30 }, hp: 90 },
      }),
    )
    const r = await runArena(makeInput({ args: ['live', 'status', 'b1'] }))
    expect(strip(r!.output)).toContain('ARENA')
    expect(strip(r!.output)).toContain('Live PvP')
  })
})

describe('runArena: unknown', () => {
  it('returns null for bash fallback', async () => {
    const r = await runArena(makeInput({ args: ['bogus'] }))
    expect(r).toBeNull()
  })
})
