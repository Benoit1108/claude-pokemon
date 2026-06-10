// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import LeaderboardTable from '~/components/leaderboard/LeaderboardTable.vue'
import type { LeaderboardEntry } from '~/types/api'

// Stub Nuxt auto-imports : NuxtLink renders as plain <a>, navigateTo is no-op.
// We're testing the component in isolation, not the routing behaviour.
beforeAll(() => {
  ;(globalThis as unknown as { navigateTo: () => void }).navigateTo = vi.fn()
})

const stubs = {
  NuxtLink: {
    template: '<a :href="to"><slot /></a>',
    props: ['to'],
  },
}

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    anon_id: 'c5bbdea6',
    display_name: 'benoit1108',
    value: 2_638_000,
    lineage: 'fire',
    level: 0,
    is_shiny: false,
    submitted_at: '2026-05-06T10:00:00Z',
    ...overrides,
  }
}

describe('<LeaderboardTable />', () => {
  it('renders empty-state row when no entries', () => {
    const wrapper = mount(LeaderboardTable, { props: { entries: [] }, global: { stubs } })
    expect(wrapper.text()).toContain('No trainer has shared their stats yet')
  })

  it('renders 1 row per entry with rank prefix', () => {
    const entries = [
      entry({ anon_id: 'aaa11111', value: 1000 }),
      entry({ anon_id: 'bbb22222', value: 500 }),
    ]
    const wrapper = mount(LeaderboardTable, { props: { entries }, global: { stubs } })

    const rows = wrapper.findAll('tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.text()).toContain('🥇')
    expect(rows[1]?.text()).toContain('🥈')
  })

  it('links each row to /trainer/<anon_id>', () => {
    const wrapper = mount(LeaderboardTable, {
      props: { entries: [entry({ anon_id: 'c5bbdea6' })] },
      global: { stubs },
    })
    const link = wrapper.find('a')
    expect(link.attributes('href')).toBe('/trainer/c5bbdea6')
  })

  it('renders pseudo#shortid label when display_name set', () => {
    const wrapper = mount(LeaderboardTable, {
      props: { entries: [entry()] },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('benoit1108#c5bb')
  })

  it('renders raw anon_id when display_name is null', () => {
    const wrapper = mount(LeaderboardTable, {
      props: { entries: [entry({ display_name: null, anon_id: 'deadbeef' })] },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('deadbeef')
    expect(wrapper.text()).not.toContain('#dead')
  })

  it('renders 🥚 for level 0, Lv.X otherwise', () => {
    const wrapper = mount(LeaderboardTable, {
      props: {
        entries: [
          entry({ anon_id: 'aaa11111', level: 0 }),
          entry({ anon_id: 'bbb22222', level: 30 }),
        ],
      },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('🥚')
    expect(wrapper.text()).toContain('Lv.30')
  })

  it('renders shiny mark ✦ when is_shiny=true', () => {
    const wrapper = mount(LeaderboardTable, {
      props: { entries: [entry({ is_shiny: true })] },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('✦')
  })

  it('renders custom title prop', () => {
    const wrapper = mount(LeaderboardTable, {
      props: { entries: [], title: 'Top shinies' },
      global: { stubs },
    })
    expect(wrapper.text()).toContain('Top shinies')
  })
})
