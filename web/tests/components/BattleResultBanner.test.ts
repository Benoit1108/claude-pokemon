// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BattleResultBanner from '~/components/arena/BattleResultBanner.vue'
import type { BattleParticipant } from '~/types/api'

const challenger: BattleParticipant = {
  anon_id: 'aaaaaaaa',
  display_name: 'Ash',
  lineage: 'fire',
  level: 30,
  is_shiny: false,
}
const defender: BattleParticipant = {
  anon_id: 'bbbbbbbb',
  display_name: 'Misty',
  lineage: 'water',
  level: 30,
  is_shiny: false,
}

describe('<BattleResultBanner />', () => {
  it('shows challenger label when challenger wins', () => {
    const w = mount(BattleResultBanner, {
      props: {
        winner: 'challenger',
        reason: 'ko',
        challenger,
        defender,
        totalTurns: 12,
      },
    })
    expect(w.text()).toContain('Ash#aaaa')
    expect(w.text()).toContain('wins!')
  })

  it('shows defender label when defender wins', () => {
    const w = mount(BattleResultBanner, {
      props: {
        winner: 'defender',
        reason: 'ko',
        challenger,
        defender,
        totalTurns: 8,
      },
    })
    expect(w.text()).toContain('Misty#bbbb')
  })

  it('shows draw symbol when winner is draw', () => {
    const w = mount(BattleResultBanner, {
      props: {
        winner: 'draw',
        reason: 'turn_limit',
        challenger,
        defender,
        totalTurns: 50,
      },
    })
    expect(w.text()).toContain('Draw')
    expect(w.text()).not.toContain('wins!')
  })

  it('renders KO reason for ko', () => {
    const w = mount(BattleResultBanner, {
      props: {
        winner: 'challenger',
        reason: 'ko',
        challenger,
        defender,
        totalTurns: 5,
      },
    })
    expect(w.text()).toContain('KO')
    expect(w.text()).toContain('5 turns')
  })

  it('renders turn-limit reason when applicable', () => {
    const w = mount(BattleResultBanner, {
      props: {
        winner: 'draw',
        reason: 'turn_limit',
        challenger,
        defender,
        totalTurns: 50,
      },
    })
    expect(w.text()).toContain('turn limit reached')
  })

  it('uses singular "turn" for 1 turn', () => {
    const w = mount(BattleResultBanner, {
      props: {
        winner: 'challenger',
        reason: 'ko',
        challenger,
        defender,
        totalTurns: 1,
      },
    })
    expect(w.text()).toContain('1 turn ')
    expect(w.text()).not.toContain('1 turns')
  })
})
