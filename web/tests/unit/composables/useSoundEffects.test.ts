// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useSoundEffects } from '~/composables/useSoundEffects'

type SfxApi = ReturnType<typeof useSoundEffects>

/**
 * Mount a tiny host component so onMounted hooks inside the composable
 * actually fire. effectScope alone does NOT trigger lifecycle hooks.
 */
function mountSfx(): { sfx: SfxApi } {
  let sfx!: SfxApi
  const Host = defineComponent({
    setup() {
      sfx = useSoundEffects()
      return () => h('div')
    },
  })
  mount(Host)
  return { sfx }
}

describe('useSoundEffects', () => {
  beforeEach(() => {
    localStorage.clear()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('exposes the play methods + theme/enabled/cycleSound', () => {
    const { sfx } = mountSfx()
    for (const m of [
      'playHit',
      'playSuperEffective',
      'playCritical',
      'playWin',
      'playDefeat',
      'playDraw',
      'cycleSound',
    ] as const) {
      expect(typeof sfx[m]).toBe('function')
    }
    expect(typeof sfx.enabled.value).toBe('boolean')
    expect(sfx.theme.value).toBe('silent')
  })

  it('starts silent / disabled by default (no localStorage entry)', () => {
    const { sfx } = mountSfx()
    expect(sfx.theme.value).toBe('silent')
    expect(sfx.enabled.value).toBe(false)
  })

  it('cycleSound goes silent → 8bit → orchestral → silent and persists', () => {
    const { sfx } = mountSfx()
    sfx.cycleSound()
    expect(sfx.theme.value).toBe('8bit')
    expect(sfx.enabled.value).toBe(true)
    expect(localStorage.getItem('arena-sound-theme')).toBe('8bit')
    sfx.cycleSound()
    expect(sfx.theme.value).toBe('orchestral')
    expect(sfx.enabled.value).toBe(true)
    sfx.cycleSound()
    expect(sfx.theme.value).toBe('silent')
    expect(sfx.enabled.value).toBe(false)
    expect(localStorage.getItem('arena-sound-theme')).toBe('silent')
  })

  it('reads a stored theme on mount', () => {
    localStorage.setItem('arena-sound-theme', 'orchestral')
    const { sfx } = mountSfx()
    expect(sfx.theme.value).toBe('orchestral')
    expect(sfx.enabled.value).toBe(true)
  })

  it('migrates the pre-2.12 boolean toggle (arena-sound-enabled=1 → 8bit)', () => {
    localStorage.setItem('arena-sound-enabled', '1')
    const { sfx } = mountSfx()
    expect(sfx.theme.value).toBe('8bit')
  })

  it('play methods are no-ops when silent (no throw)', () => {
    const { sfx } = mountSfx()
    expect(sfx.theme.value).toBe('silent')
    expect(() => sfx.playHit()).not.toThrow()
    expect(() => sfx.playCritical()).not.toThrow()
    expect(() => sfx.playWin()).not.toThrow()
  })

  it('play methods do not throw when enabled, even if AudioContext is unavailable', () => {
    const { sfx } = mountSfx()
    sfx.cycleSound() // → 8bit
    expect(() => sfx.playHit()).not.toThrow()
    expect(() => sfx.playSuperEffective()).not.toThrow()
    sfx.cycleSound() // → orchestral (detuned 2-voice path)
    expect(() => sfx.playCritical()).not.toThrow()
    expect(() => sfx.playDefeat()).not.toThrow()
  })

  it('survives localStorage write failure (private browsing)', () => {
    const { sfx } = mountSfx()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => sfx.cycleSound()).not.toThrow()
    expect(sfx.theme.value).toBe('8bit') // state still changed in memory
    spy.mockRestore()
  })
})
