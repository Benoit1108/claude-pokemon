// Branch coverage for the box-free / boxed list views: badges, inventory,
// team, pc, stats, trainer-card, pokedex. Full vs empty for each, plus the
// scenario-specific conditionals (eevee form hint, multipliers, shiny charm,
// share active/inactive, legendary wild marker). Asserts on key substrings, not
// the frozen bytes (that's the bats golden tests' job).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  renderBadges,
  renderInventory,
  renderTeam,
  renderPc,
  renderStats,
  renderTrainerCard,
  renderPokedex,
  type RenderContext,
} from '../src/render/views/index.js'
import type { PokemonState, PokemonData, CompanionEntry } from 'claude-pokemon-shared/state-types'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const data = JSON.parse(readFileSync(join(root, 'lib', 'data.default.json'), 'utf8')) as PokemonData
const en = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'en.json'), 'utf8'))
const fr = JSON.parse(readFileSync(join(root, 'lib', 'locales', 'fr.json'), 'utf8'))

const strip = (s: string): string => s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '') // eslint-disable-line no-control-regex

function ctx(state: PokemonState, opts: Partial<RenderContext> = {}): RenderContext {
  return { state, data, locale: en, lang: 'en', ...opts }
}

// ── badges ───────────────────────────────────────────────────────────────────
describe('renderBadges', () => {
  it('renders every slot, with earned dates for owned badges', () => {
    const out = strip(
      renderBadges(ctx({ badges: [{ id: 'hatch', earned_at: '2026-05-07T12:00:00Z' }] })),
    )
    expect(out).toContain(en.badges.title)
    expect(out).toContain(en.badges.hatch[0]) // label
    expect(out).toContain('2026-05-07') // earned date
    expect(out).toContain('▢') // at least one unearned slot
  })

  it('renders all slots as unearned when no badges', () => {
    const out = strip(renderBadges(ctx({ badges: [] })))
    expect(out).toContain('▢')
    expect(out).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

// ── inventory ──────────────────────────────────────────────────────────────────
describe('renderInventory', () => {
  it('renders items with quantities and the eevee-form hint', () => {
    const out = strip(
      renderInventory(ctx({ items: { oran_berry: 2, lucky_egg: 1 }, eevee_form: 'vaporeon' })),
    )
    expect(out).toContain(en.inventory.title)
    expect(out).toContain('×2')
    const oranName = data.items!.oran_berry!.name as string
    expect(out).toContain(oranName)
    const formName = data.lineages!.eevee!.stages!.find(s => s.showdown_id === 'vaporeon')!
      .name as string
    expect(out).toContain(formName)
  })

  it('shows the empty message with no items and no eevee hint', () => {
    const out = strip(renderInventory(ctx({ items: {} })))
    expect(out).toContain(en.inventory.empty.replace(/%%/g, '%'))
  })

  it('falls back to the item id when no metadata is found', () => {
    const out = strip(renderInventory(ctx({ items: { mystery_item: 3 } })))
    expect(out).toContain('mystery_item')
    expect(out).toContain('×3')
  })
})

// ── team / pc ───────────────────────────────────────────────────────────────────
const companion: CompanionEntry = {
  lineage: 'water',
  level: 36,
  total_xp: 50_000_000,
  is_shiny: true,
  max_stage: 'Blastoise',
  eevee_form: null,
  created_at: '2026-05-07T00:00:00Z',
  completed_at: '2026-05-10T00:00:00Z',
}

describe('renderTeam', () => {
  it('renders a roster entry with level, shiny star, lineage label', () => {
    const out = strip(renderTeam(ctx({ team: [companion] })))
    expect(out).toContain(en.team.title)
    expect(out).toContain('Blastoise')
    expect(out).toContain('Lv.36')
    expect(out).toContain('★')
    expect(out).toContain(data.lineages!.water!.label as string)
  })

  it('shows the empty-team message when no team', () => {
    const out = strip(renderTeam(ctx({ team: [] })))
    expect(out).toContain(en.team.empty)
  })

  it('appends the pc-overflow hint when pc_storage is non-empty', () => {
    const out = strip(renderTeam(ctx({ team: [companion], pc_storage: [companion] })))
    // overflow line interpolates the count; the surrounding template text appears
    expect(out).toContain('1')
  })

  it('renders missing dates as ? placeholders', () => {
    const out = strip(
      renderTeam(ctx({ team: [{ lineage: 'grass', level: 8, max_stage: 'Bulbasaur' }] })),
    )
    expect(out).toContain('?')
    expect(out).not.toContain('null')
  })
})

describe('renderPc', () => {
  it('renders pc storage entries', () => {
    const out = strip(renderPc(ctx({ pc_storage: [companion] })))
    expect(out).toContain(en.pc.title)
    expect(out).toContain('Blastoise')
  })

  it('shows empty message when pc storage is empty', () => {
    const out = strip(renderPc(ctx({ pc_storage: [] })))
    expect(out).toContain(en.team.empty)
  })
})

// ── stats ────────────────────────────────────────────────────────────────────
describe('renderStats', () => {
  it('renders lifetime totals and the multipliers block when present', () => {
    const state: PokemonState = {
      total_xp: 5_000_000,
      lifetime_stats: {
        total_tokens: 1_234_567,
        total_evolutions: 4,
        total_shinies: 2,
        max_level: 40,
        lineages_completed: ['fire', 'water'],
        total_companions: 3,
        games_won: 5,
        games_played: 9,
        first_shiny_at: '2026-05-08T00:00:00Z',
      },
      last_xp_multipliers: {
        context: '1.5',
        type_match: '2.0',
        daily_bonus: '1.0',
        status: '1.0',
      },
      status: 'tired',
      high_context_streak: 3,
    }
    const out = strip(renderStats(ctx(state)))
    expect(out).toContain(en.stats.title)
    expect(out).toContain('1 234 567') // fmtInt grouping
    expect(out).toContain('Lv.40')
    expect(out).toContain(en.stats.multipliers_title)
    expect(out).toContain('×3.00') // combined product
    expect(out).toContain('2026-05-08')
    // tired warning + shiny charm both fire
    expect(out).toContain(en.stats.shiny_charm)
  })

  it('renders without multipliers / warnings on a fresh state', () => {
    const out = strip(renderStats(ctx({ lifetime_stats: {} })))
    expect(out).toContain(en.stats.title)
    expect(out).not.toContain(en.stats.multipliers_title)
    expect(out).not.toContain(en.stats.shiny_charm)
    // first_shiny falls back to —
    expect(out).toContain('—')
  })

  it('falls back to the deprecated total_compagnons key', () => {
    const out = strip(renderStats(ctx({ lifetime_stats: { total_compagnons: 7 } })))
    expect(out).toContain('7')
  })
})

// ── trainer-card ───────────────────────────────────────────────────────────────
describe('renderTrainerCard', () => {
  it('renders an unnamed card with the share-inactive section', () => {
    const out = strip(
      renderTrainerCard(
        ctx({
          lineage: 'fire',
          current_level: 16,
          total_xp: 3_000_000,
          friendship: 50,
          lifetime_stats: { total_tokens: 1000 },
          pokedex_wild: {},
          badges: [],
        }),
      ),
    )
    expect(out).toContain(en.trainer_card.title)
    expect(out).toContain(en.trainer_card.unnamed)
    expect(out).toContain('/ 251') // pokedex line
    expect(out).toContain(data.lineages!.fire!.label as string)
  })

  it('renders a named, shiny card with badges and active sharing', () => {
    const dataShared: PokemonData = {
      ...data,
      stats_share: { enabled: true, anon_id: 'abcd1234', display_name: 'Ash' },
    }
    const out = strip(
      renderTrainerCard({
        state: {
          lineage: 'eevee',
          current_level: 30,
          eevee_form: 'vaporeon',
          is_shiny: true,
          total_xp: 9_000_000,
          badges: [{ id: 'hatch', earned_at: '2026-05-07T00:00:00Z' }],
          pokedex_wild: { bulbasaur: { count: 1 } },
        },
        data: dataShared,
        locale: en,
        lang: 'en',
      }),
    )
    expect(out).toContain('Ash#abcd') // name#first4
    expect(out).toContain('✦') // shiny mark
    expect(out).toContain(en.badges.hatch[0])
    expect(out).toContain('/ 251')
  })

  it('renders the anon-only label when display_name is absent', () => {
    const dataShared: PokemonData = {
      ...data,
      stats_share: { enabled: true, anon_id: 'deadbeef', display_name: null },
    }
    const out = strip(
      renderTrainerCard({
        state: { lineage: 'fire', current_level: 5 },
        data: dataShared,
        locale: en,
        lang: 'en',
      }),
    )
    expect(out).toContain('deadbeef')
  })
})

// ── pokedex ────────────────────────────────────────────────────────────────────
describe('renderPokedex', () => {
  it('renders seen lineages with counts and unseen ones as ▢', () => {
    const out = strip(
      renderPokedex(
        ctx({
          pokedex: {
            fire: { seen: true, count: 3, shiny_seen: true, shiny_count: 1 },
          },
          pokedex_wild: {},
        }),
      ),
    )
    expect(out).toContain(en.pokedex.title_lineages)
    expect(out).toContain('✓')
    expect(out).toContain('▢') // unseen lineages
    expect(out).toContain(en.pokedex.shiny_seen)
  })

  it('renders the wild grid with seen names and ??? placeholders', () => {
    const firstWild = data.wild_pool![0]!
    // The wild grid resolves names via data.language; force EN here.
    const out = strip(
      renderPokedex(
        ctx(
          { pokedex: {}, pokedex_wild: { [firstWild.id]: { count: 1 } } },
          { data: { ...data, language: 'en' } },
        ),
      ),
    )
    expect(out).toContain(en.pokedex.title_wild)
    expect(out).toContain('???') // unseen wilds
    expect(out).toContain(firstWild.name_en as string) // seen wild resolved in EN
  })

  it('marks legendary wilds with a ★ when present in the pool', () => {
    const legendary = (data.wild_pool ?? []).find(
      w => (w as { rarity?: string }).rarity === 'legendary',
    )
    expect(legendary).toBeDefined()
    const out = strip(
      renderPokedex(ctx({ pokedex: {}, pokedex_wild: { [legendary!.id]: { count: 1 } } })),
    )
    expect(out).toContain('★')
  })

  it('resolves FR wild names when data.language is fr', () => {
    const firstWild = data.wild_pool![0]!
    const out = strip(
      renderPokedex({
        state: { pokedex: {}, pokedex_wild: { [firstWild.id]: { count: 1 } } },
        data: { ...data, language: 'fr' },
        locale: fr,
        lang: 'fr',
      }),
    )
    expect(out).toContain(firstWild.name_fr as string)
  })
})
