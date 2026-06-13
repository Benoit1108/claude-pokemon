// runLive dispatcher + renderLiveStatus (Phase coverage). fetch mocked per-call;
// asserts on structural substrings + dataChanged, not frozen bytes.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runLive, renderLiveStatus } from '../src/live.js'
import type { LiveInput } from '../src/live.js'
import type { Locale } from '../src/render/i18n.js'
import type { PokemonData } from 'claude-pokemon-shared/state-types'

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

function makeInput(over: Partial<LiveInput> = {}): LiveInput {
  const data: PokemonData = over.data ?? {
    stats_share: { enabled: true, anon_id: 'abcd1234', endpoint: 'https://api' },
    arena: { enabled: true, web_url: 'https://web', last_live_battle_id: 'last99' },
  }
  return {
    args: over.args ?? ['status'],
    data,
    locale: over.locale ?? en,
    secret: over.secret ?? 'sek',
  }
}

describe('renderLiveStatus', () => {
  it('renders both participants + my move hints when active and my turn', () => {
    const out = strip(
      renderLiveStatus(
        {
          state: 'active',
          turn_no: 2,
          challenger: {
            anon_id: 'me',
            snapshot: { lineage: 'fire', level: 40 },
            hp: 100,
            has_pending_action: false,
          },
          defender: {
            anon_id: 'foe',
            snapshot: { lineage: 'water', level: 38 },
            hp: 80,
            has_pending_action: true,
          },
        },
        'me',
      ),
    )
    expect(out).toContain('Live PvP')
    expect(out).toContain('me')
    expect(out).toContain('foe')
    expect(out).toContain('Tes attaques')
  })
  it('defender awaiting acceptance (null hp) + commit marker', () => {
    const out = strip(
      renderLiveStatus(
        {
          state: 'active',
          challenger: {
            anon_id: 'me',
            snapshot: { lineage: 'fire', level: 40 },
            hp: 100,
            has_pending_action: true,
          },
          defender: { anon_id: 'foe', snapshot: { lineage: 'water', level: 38 }, hp: null },
        },
        'foe',
      ),
    )
    expect(out).toContain("en attente d'acceptation")
    expect(out).toContain('commit ✓')
  })
  it('finished battle shows the winner banner (no move hints)', () => {
    const out = strip(
      renderLiveStatus(
        {
          state: 'finished',
          winner: 'me',
          reason: 'ko',
          challenger: { anon_id: 'me' },
          defender: { anon_id: 'foe', hp: 0 },
        },
        'me',
      ),
    )
    expect(out).toContain('Combat terminé')
    expect(out).toContain('winner=me')
    expect(out).not.toContain('Tes attaques')
  })
  it('active but my pending → no move hints', () => {
    const out = strip(
      renderLiveStatus(
        {
          state: 'active',
          challenger: {
            anon_id: 'me',
            snapshot: { lineage: 'fire', level: 40 },
            hp: 100,
            has_pending_action: true,
          },
          defender: { anon_id: 'foe', hp: 80 },
        },
        'me',
      ),
    )
    expect(out).not.toContain('Tes attaques')
  })
  it('defender move hints when it is the defender turn', () => {
    const out = strip(
      renderLiveStatus(
        {
          state: 'active',
          challenger: { anon_id: 'me', hp: 100, has_pending_action: true },
          defender: {
            anon_id: 'foe',
            snapshot: { lineage: 'water', level: 30 },
            hp: 80,
            has_pending_action: false,
          },
        },
        'foe',
      ),
    )
    expect(out).toContain('Tes attaques')
  })
})

describe('runLive: invite', () => {
  it('usage when no opponent', async () => {
    const r = await runLive(makeInput({ args: ['invite'] }))
    expect(strip(r.output)).toContain('Usage')
  })
  it('success sets last battle id', async () => {
    stubFetch(jsonResponse({ battle_id: 'b1' }))
    const r = await runLive(makeInput({ args: ['invite', 'rival'] }))
    expect(r.dataChanged).toBe(true)
    expect(r.data.arena!.last_live_battle_id).toBe('b1')
    expect(strip(r.output)).toContain('Invite sent to rival')
    expect(strip(r.output)).toContain('Spectator: https://web/live/b1')
  })
  it('failure when no battle id', async () => {
    stubFetch(jsonResponse({ error: 'busy' }, 409))
    const r = await runLive(makeInput({ args: ['invite', 'rival'] }))
    expect(strip(r.output)).toContain('Invite failed')
  })
})

describe('runLive: accept', () => {
  it('usage when no id', async () => {
    const r = await runLive(
      makeInput({
        args: ['accept'],
        data: {
          stats_share: { endpoint: 'https://api', anon_id: 'a' },
          arena: { enabled: true },
        } as PokemonData,
      }),
    )
    expect(strip(r.output)).toContain('Usage')
  })
  it('failure when state not active', async () => {
    stubFetch(jsonResponse({ state: 'pending' }))
    const r = await runLive(makeInput({ args: ['accept', 'b1'] }))
    expect(strip(r.output)).toContain('Accept failed')
  })
  it('success then renders status', async () => {
    stubFetch(
      jsonResponse({ state: 'active' }),
      jsonResponse({
        state: 'active',
        turn_no: 1,
        challenger: { anon_id: 'foe', snapshot: { lineage: 'fire', level: 40 }, hp: 100 },
        defender: { anon_id: 'abcd1234', snapshot: { lineage: 'water', level: 30 }, hp: 90 },
      }),
    )
    const r = await runLive(makeInput({ args: ['accept', 'b1'] }))
    expect(strip(r.output)).toContain('Battle accepted')
    expect(strip(r.output)).toContain('Live PvP')
    expect(strip(r.output)).toContain('Spectator')
  })
  it('success but status fetch fails → not found', async () => {
    stubFetch(jsonResponse({ state: 'active' }), jsonResponse({}, 500))
    const r = await runLive(makeInput({ args: ['accept', 'b1'] }))
    expect(strip(r.output)).toContain('Battle not found')
  })
})

describe('runLive: status', () => {
  it('usage when no id available', async () => {
    const r = await runLive(
      makeInput({
        args: ['status'],
        data: {
          stats_share: { endpoint: 'https://api', anon_id: 'a' },
          arena: { enabled: true },
        } as PokemonData,
      }),
    )
    expect(strip(r.output)).toContain('Usage')
  })
  it('not found', async () => {
    stubFetch(jsonResponse({}, 404))
    const r = await runLive(makeInput({ args: ['status', 'b1'] }))
    expect(strip(r.output)).toContain('Battle not found: b1')
  })
  it('renders status using last id', async () => {
    stubFetch(
      jsonResponse({
        state: 'active',
        turn_no: 1,
        challenger: { anon_id: 'abcd1234', snapshot: { lineage: 'fire', level: 40 }, hp: 100 },
        defender: { anon_id: 'foe', snapshot: { lineage: 'water', level: 30 }, hp: 90 },
      }),
    )
    const r = await runLive(makeInput({ args: [] }))
    expect(strip(r.output)).toContain('Live PvP')
  })
})

describe('runLive: move', () => {
  it('no battle', async () => {
    const r = await runLive(
      makeInput({
        args: ['move', 'flamethrower'],
        data: {
          stats_share: { endpoint: 'https://api', anon_id: 'a' },
          arena: { enabled: true },
        } as PokemonData,
      }),
    )
    expect(strip(r.output)).toContain('No active battle')
  })
  it('usage when no move name', async () => {
    const r = await runLive(makeInput({ args: ['move'] }))
    expect(strip(r.output)).toContain('Usage')
  })
  it('network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))),
    )
    const r = await runLive(makeInput({ args: ['attack', 'tackle'] }))
    expect(strip(r.output)).toContain('Move rejected')
  })
  it('server error body', async () => {
    stubFetch(jsonResponse({ error: 'not_your_turn' }, 400))
    const r = await runLive(makeInput({ args: ['move', 'tackle'] }))
    expect(strip(r.output)).toContain('not_your_turn')
  })
  it('success renders status', async () => {
    stubFetch(
      jsonResponse({
        state: 'active',
        turn_no: 2,
        challenger: {
          anon_id: 'abcd1234',
          snapshot: { lineage: 'fire', level: 40 },
          hp: 80,
          has_pending_action: true,
        },
        defender: { anon_id: 'foe', snapshot: { lineage: 'water', level: 30 }, hp: 70 },
      }),
    )
    const r = await runLive(makeInput({ args: ['move', 'tackle'] }))
    expect(strip(r.output)).toContain('Move locked: tackle')
    expect(strip(r.output)).toContain('Live PvP')
  })
})

describe('runLive: forfeit', () => {
  it('usage when no id', async () => {
    const r = await runLive(
      makeInput({
        args: ['forfeit'],
        data: {
          stats_share: { endpoint: 'https://api', anon_id: 'a' },
          arena: { enabled: true },
        } as PokemonData,
      }),
    )
    expect(strip(r.output)).toContain('Usage')
  })
  it('forfeits with returned state', async () => {
    stubFetch(jsonResponse({ state: 'abandoned' }))
    const r = await runLive(makeInput({ args: ['abandon', 'b1'] }))
    expect(strip(r.output)).toContain('Battle forfeited (state: abandoned)')
  })
})

describe('runLive: unknown', () => {
  it('reports the unknown subcommand', async () => {
    const r = await runLive(makeInput({ args: ['bogus'] }))
    expect(strip(r.output)).toContain('Unknown subcommand: bogus')
  })
})
