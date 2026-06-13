// renderMain + main-sections branch coverage (Phase R3c view layer). The bats
// golden tests freeze the exact bytes; here we drive each conditional path —
// egg / leveled / max-level / shiny / eevee form, with and without a sprite,
// with populated recent_events / evolution_history — and assert on key
// substrings rather than the frozen output.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderMain, type RenderContext } from '../src/render/views/index.js'
import type { PokemonState, PokemonData, RecentEvent } from 'claude-pokemon-shared/state-types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const data = JSON.parse(readFileSync(join(root, 'lib', 'data.default.json'), 'utf8')) as PokemonData
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8'))
const fr = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'fr.json'), 'utf8'))

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

function ctx(state: PokemonState, opts: Partial<RenderContext> = {}): RenderContext {
  return { state, data, locale: en, lang: 'en', ...opts }
}

const baseState: PokemonState = {
  lineage: 'fire',
  is_shiny: false,
  current_level: 5,
  total_xp: 2_000_000,
  evolution_history: [],
  badges: [],
  team: [],
  pc_storage: [],
  created_at: '2026-05-07T00:00:00Z',
}

describe('renderMain — header / sprite', () => {
  it('renders the companion box and the lineage label, no sprite block by default', () => {
    const out = strip(renderMain(ctx(baseState)))
    expect(out).toContain('BUDDY')
    expect(out).toContain(data.lineages!.fire!.label as string)
    expect(out).toContain('Lv.5')
    expect(out).not.toContain('  ▓▓') // no sprite lines
  })

  it('emits the sprite block when sprite lines are provided', () => {
    const out = strip(renderMain(ctx(baseState, { sprite: ['SPRITE-LINE-A', 'SPRITE-LINE-B'] })))
    expect(out).toContain('SPRITE-LINE-A')
    expect(out).toContain('SPRITE-LINE-B')
  })

  it('shows the SHINY marker for a shiny companion', () => {
    const out = strip(renderMain(ctx({ ...baseState, is_shiny: true })))
    expect(out).toContain('SHINY')
  })
})

describe('renderMain — xp bar branches', () => {
  it('egg (level 0): renders the leveled-progress branch toward the next stage', () => {
    const out = strip(renderMain(ctx({ ...baseState, current_level: 0, total_xp: 0 })))
    expect(out).toContain('Lv.0')
    expect(out).toContain('%') // progress bar percentage
  })

  it('mid-level: shows stage progress and remaining tokens toward the next level', () => {
    const out = strip(renderMain(ctx(baseState)))
    expect(out).toContain('tokens')
    expect(out).toContain(en.main.remaining)
    expect(out).toContain(en.main.stage_progress)
  })

  it('max level: shows Lv.MAX marker and no remaining line', () => {
    const maxLevel = data.thresholds!.length - 1
    const out = strip(
      renderMain(ctx({ ...baseState, current_level: maxLevel, total_xp: 999_999_999 })),
    )
    expect(out).toContain('Lv.MAX')
    expect(out).not.toContain(en.main.stage_progress)
  })

  it('final-stage-but-not-max (nextLvl === null): shows toward_max progress', () => {
    // fire's last stage is min_level 100 == maxLevel, so use a lineage whose top
    // stage sits below maxLevel. Find one dynamically.
    const lin = Object.entries(data.lineages!).find(([, d]) => {
      const stages = d.stages ?? []
      const top = Math.max(...stages.map(s => s.min_level))
      return top < data.thresholds!.length - 1
    })
    expect(lin).toBeDefined()
    const [name, def] = lin!
    const top = Math.max(...(def.stages ?? []).map(s => s.min_level))
    const out = strip(
      renderMain(ctx({ ...baseState, lineage: name, current_level: top, total_xp: 50_000_000 })),
    )
    expect(out).toContain(en.main.toward_max)
  })
})

describe('renderMain — eevee forms', () => {
  it('eevee Lv.30 with a chosen form resolves the form name', () => {
    const out = strip(
      renderMain(
        ctx({ ...baseState, lineage: 'eevee', current_level: 30, eevee_form: 'vaporeon' }),
      ),
    )
    const formName = data.lineages!.eevee!.stages!.find(s => s.showdown_id === 'vaporeon')!
      .name as string
    expect(out).toContain(formName)
  })

  it('eevee Lv.30 without a chosen form falls back to default stage resolution', () => {
    const out = strip(
      renderMain(ctx({ ...baseState, lineage: 'eevee', current_level: 30, eevee_form: null })),
    )
    // full chain box header still names the eevee lineage label
    expect(out).toContain(data.lineages!.eevee!.label as string)
  })
})

describe('renderMain — stat fields', () => {
  it('renders moves, friendship, held item, badges and injury banner when present', () => {
    const state: PokemonState = {
      ...baseState,
      current_level: 16,
      friendship: 600, // >= 500 → 💞
      held_item: 'oran_berry',
      injured_ticks_remaining: 3,
      badges: [
        { id: 'hatch', earned_at: '2026-05-07T00:00:00Z' },
        { id: 'first_evolution', earned_at: '2026-05-08T00:00:00Z' },
      ],
    }
    const out = strip(renderMain(ctx(state)))
    expect(out).toContain(en.main.friendship)
    expect(out).toContain('600')
    expect(out).toContain(en.main.held_item)
    expect(out).toContain('ticks remaining')
    expect(out).toContain(en.main.badges)
    expect(out).toContain('(2/15)')
  })

  it('lower friendship tiers select different heart emoji', () => {
    const low = strip(renderMain(ctx({ ...baseState, friendship: 10 })))
    const mid = strip(renderMain(ctx({ ...baseState, friendship: 150 })))
    expect(low).toContain('💗')
    expect(mid).toContain('💖')
  })
})

describe('renderMain — rebalance notice', () => {
  it('shows the rebalance notice when xp ≥ 1000 and not acknowledged', () => {
    const out = strip(renderMain(ctx({ ...baseState, total_xp: 2_000_000 })))
    expect(out).toContain(en.main.xp_rebalance_title)
  })

  it('hides the notice once acknowledged', () => {
    const out = strip(
      renderMain(ctx({ ...baseState, total_xp: 2_000_000, xp_rebalance_v2_acknowledged: true })),
    )
    expect(out).not.toContain(en.main.xp_rebalance_title)
  })

  it('hides the notice below the 1000-xp floor', () => {
    const out = strip(renderMain(ctx({ ...baseState, current_level: 0, total_xp: 0 })))
    expect(out).not.toContain(en.main.xp_rebalance_title)
  })
})

describe('renderMain — recent events feed (main-sections)', () => {
  it('renders each event type', () => {
    const state: PokemonState = {
      ...baseState,
      recent_events: [
        { type: 'berry', at: '2026-05-08T11:00:00Z', name: 'Oran', emoji: '🫐', xp: 50 },
        { type: 'encounter', at: '2026-05-08T11:01:00Z', id: 'bulbasaur' },
        { type: 'battle_won', at: '2026-05-08T11:02:00Z', id: 'pikachu', xp: 200 },
        { type: 'battle_lost', at: '2026-05-08T11:03:00Z', id: 'mewtwo' },
        { type: 'item', at: '2026-05-08T11:04:00Z', name: 'Lucky Egg', emoji: '🥚' },
        { type: 'trade', at: '2026-05-08T11:05:00Z', name: 'Gengar' },
      ],
    }
    // The events feed resolves wild names via data.language (fr by default).
    const out = strip(renderMain(ctx(state, { data: { ...data, language: 'en' } })))
    expect(out).toContain(en.main.recent_events)
    // only the first 3 are rendered
    expect(out).toContain('Oran')
    expect(out).toContain('Bulbasaur') // wild name resolved in EN
  })

  it('renders the default branch for an unknown event type', () => {
    // Exercise the runtime default branch on a type the union doesn't list.
    const events = [{ type: 'mystery', at: '2026-05-08T11:00:00Z' }] as unknown as RecentEvent[]
    const out = strip(renderMain(ctx({ ...baseState, recent_events: events })))
    expect(out).toContain('mystery')
  })

  it('omits the recent-events section when empty', () => {
    const out = strip(renderMain(ctx(baseState)))
    expect(out).not.toContain(en.main.recent_events)
  })
})

describe('renderMain — evolution history (main-sections)', () => {
  it('renders history entries, including a shiny star and a missing-level placeholder', () => {
    const state: PokemonState = {
      ...baseState,
      current_level: 36,
      evolution_history: [
        { level: 16, name: 'Charmeleon', evolved_at: '2026-05-08T00:00:00Z' },
        { name: 'MysteryEvo', is_shiny: true }, // no level, no evolved_at
      ],
    }
    const out = strip(renderMain(ctx(state)))
    expect(out).toContain(en.main.history)
    expect(out).toContain('Charmeleon')
    expect(out).toContain('MysteryEvo')
    expect(out).toContain('Lv.?')
  })

  it('omits the history box when empty', () => {
    const out = strip(renderMain(ctx(baseState)))
    expect(out).not.toContain(en.main.history)
  })
})

describe('renderMain — full chain (main-sections)', () => {
  it('marks completed (✓) and current (►) stages for a leveled companion', () => {
    const out = strip(renderMain(ctx({ ...baseState, current_level: 16 })))
    expect(out).toContain(en.main.full_chain)
    expect(out).toContain('✓')
    expect(out).toContain('►')
  })

  it('marks the active eevee form with ► in the full chain', () => {
    const out = strip(
      renderMain(ctx({ ...baseState, lineage: 'eevee', current_level: 30, eevee_form: 'jolteon' })),
    )
    expect(out).toContain('►')
  })
})

describe('renderMain — locale parity', () => {
  it('renders in FR too (exercises the i18n branch)', () => {
    const out = strip(renderMain({ state: baseState, data, locale: fr, lang: 'fr' }))
    expect(out).toContain(fr.main.companion)
    expect(out).toContain(fr.main.remaining)
  })
})
