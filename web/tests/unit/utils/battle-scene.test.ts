import { describe, it, expect } from 'vitest'
import { resolveScene } from '~/utils/battle-scene'

describe('resolveScene', () => {
  it('forces the arena stadium when scene="arena"', () => {
    const s = resolveScene({ scene: 'arena', defenderLineage: 'water' })
    expect(s.env).toBe('arena')
    expect(s.bg).toBe('/battle-bg/arena.png')
    expect(s.anchors.ally.x).toBeTruthy()
    expect(s.anchors.foe.y).toBeTruthy()
  })

  it('derives the environment from the defender combat type', () => {
    expect(resolveScene({ defenderLineage: 'water' }).env).toBe('plage')
    expect(resolveScene({ defenderLineage: 'fire' }).env).toBe('volcan')
    expect(resolveScene({ defenderLineage: 'trade-dratini' }).env).toBe('canyon') // dragon
    expect(resolveScene({ defenderLineage: 'gengar' }).env).toBe('ville') // ghost
  })

  it('builds a /battle-bg/<env>.png url and always provides anchors', () => {
    const s = resolveScene({ defenderLineage: 'grass' })
    expect(s.env).toBe('prairie')
    expect(s.bg).toBe('/battle-bg/prairie.png')
    expect(s.anchors.ally).toHaveProperty('x')
    expect(s.anchors.foe).toHaveProperty('y')
  })

  it('handles unknown scene / missing defender (normal type → dojo)', () => {
    // An unrecognized scene hint is ignored → derive from type ; no defender
    // → lineageToCombatType(undefined) = 'normal' → dojo.
    expect(resolveScene({ scene: 'nope' }).env).toBe('dojo')
    expect(resolveScene({}).env).toBe('dojo')
  })
})
