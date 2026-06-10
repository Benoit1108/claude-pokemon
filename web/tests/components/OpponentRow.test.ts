// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import OpponentRow from '~/components/arena/OpponentRow.vue'
import type { ArenaOpponent } from '~/types/api'

beforeAll(() => {
  ;(globalThis as { navigateTo?: unknown }).navigateTo = vi.fn()
})

const baseOpponent: ArenaOpponent = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 30,
  is_shiny: false,
  updated_at: '2026-05-06T10:00:00Z',
}

const NuxtLinkStub = {
  template: '<a :href="to"><slot /></a>',
  props: ['to'],
}

function mountRow(opponent: ArenaOpponent) {
  return mount(OpponentRow, {
    props: { opponent },
    global: { stubs: { NuxtLink: NuxtLinkStub } },
  })
}

describe('<OpponentRow />', () => {
  it('renders the trainer label and level', () => {
    const w = mountRow(baseOpponent)
    expect(w.text()).toContain('Ash#aaaa')
    expect(w.text()).toContain('Lv.30')
  })

  it('renders a Pokémon Showdown sprite for the lineage stage', () => {
    const w = mountRow(baseOpponent)
    const img = w.find('img')
    expect(img.exists()).toBe(true)
    // fire + Lv.30 = charmeleon (min_level 16)
    expect(img.attributes('src')).toContain('charmeleon')
    expect(img.attributes('src')).toContain('play.pokemonshowdown.com')
  })

  it('uses the shiny variant URL when the opponent is shiny', () => {
    const w = mountRow({ ...baseOpponent, is_shiny: true })
    const img = w.find('img')
    expect(img.attributes('src')).toContain('-shiny/')
  })

  it('shows the lineage label (Fire, Water, ...)', () => {
    const w = mountRow(baseOpponent)
    expect(w.text()).toContain('Fire')
  })

  it('renders ★ for shiny opponents', () => {
    const w = mountRow({ ...baseOpponent, is_shiny: true })
    expect(w.text()).toContain('★')
    expect(w.classes().join(' ')).toContain('ring-1')
  })

  it('does NOT render ★ for non-shiny', () => {
    const w = mountRow(baseOpponent)
    expect(w.text()).not.toContain('★')
  })

  it('falls back to anon_id when display_name is null', () => {
    const w = mountRow({ ...baseOpponent, display_name: null })
    expect(w.text()).toContain('aaaaaaaa')
  })

  it('links to the trainer page', () => {
    const w = mountRow(baseOpponent)
    const link = w.find('a')
    expect(link.attributes('href')).toBe('/trainer/aaaaaaaa')
  })
})
