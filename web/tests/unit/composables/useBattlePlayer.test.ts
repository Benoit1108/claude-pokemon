// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope } from 'vue'
import { useBattlePlayer } from '~/composables/useBattlePlayer'
import type { BattleTurn } from '~/types/api'

function makeTurns(n: number): BattleTurn[] {
  return Array.from({ length: n }, (_, i) => ({
    turn: i + 1,
    actor: i % 2 === 0 ? 'challenger' : 'defender',
    damage: 10 + i,
    effectiveness: 1,
    critical: false,
    defender_hp_after: 100 - (i + 1) * 10,
  }))
}

/**
 * The composable uses onMounted/onUnmounted, which must run inside an
 * effectScope (or component setup) to register their callbacks. Wrap the
 * call so test code can drive lifecycle hooks manually if needed.
 */
function withScope<T>(fn: () => T): T {
  const scope = effectScope()
  return scope.run(fn) as T
}

describe('useBattlePlayer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at currentTurnIdx = -1 with no turns visible', () => {
    const turns = makeTurns(3)
    const p = withScope(() => useBattlePlayer(turns))
    expect(p.currentTurnIdx.value).toBe(-1)
    expect(p.visibleTurns.value).toEqual([])
    expect(p.isFinished.value).toBe(false)
    expect(p.isPlaying.value).toBe(false)
    expect(p.totalTurns).toBe(3)
  })

  it('advances one turn per interval at speed=1', () => {
    const turns = makeTurns(3)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100 }))
    p.play()
    expect(p.isPlaying.value).toBe(true)
    vi.advanceTimersByTime(100)
    expect(p.currentTurnIdx.value).toBe(0)
    expect(p.visibleTurns.value).toHaveLength(1)
    vi.advanceTimersByTime(100)
    expect(p.currentTurnIdx.value).toBe(1)
    vi.advanceTimersByTime(100)
    expect(p.currentTurnIdx.value).toBe(2)
    expect(p.isFinished.value).toBe(true)
    expect(p.isPlaying.value).toBe(false) // auto-pauses at end
  })

  it('respects speed multiplier (2× = half interval)', () => {
    const turns = makeTurns(3)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100, speed: 2 }))
    p.play()
    vi.advanceTimersByTime(50)
    expect(p.currentTurnIdx.value).toBe(0)
    vi.advanceTimersByTime(50)
    expect(p.currentTurnIdx.value).toBe(1)
  })

  it('pause stops advancing', () => {
    const turns = makeTurns(5)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100 }))
    p.play()
    vi.advanceTimersByTime(100)
    expect(p.currentTurnIdx.value).toBe(0)
    p.pause()
    expect(p.isPlaying.value).toBe(false)
    vi.advanceTimersByTime(500)
    expect(p.currentTurnIdx.value).toBe(0) // unchanged
  })

  it('toggle alternates play and pause', () => {
    const turns = makeTurns(3)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100 }))
    p.toggle()
    expect(p.isPlaying.value).toBe(true)
    p.toggle()
    expect(p.isPlaying.value).toBe(false)
  })

  it('skipToEnd jumps to last turn and pauses', () => {
    const turns = makeTurns(5)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100 }))
    p.play()
    p.skipToEnd()
    expect(p.currentTurnIdx.value).toBe(4)
    expect(p.isFinished.value).toBe(true)
    expect(p.isPlaying.value).toBe(false)
    expect(p.visibleTurns.value).toHaveLength(5)
  })

  it('restart resets to -1 then resumes playback', async () => {
    const turns = makeTurns(3)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100 }))
    p.play()
    p.skipToEnd()
    expect(p.currentTurnIdx.value).toBe(2)
    p.restart()
    expect(p.currentTurnIdx.value).toBe(-1)
    // restart triggers a play() via nextTick
    await vi.advanceTimersByTimeAsync(0)
    expect(p.isPlaying.value).toBe(true)
  })

  it('exposes lastTurn matching currentTurnIdx', () => {
    const turns = makeTurns(3)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100 }))
    expect(p.lastTurn.value).toBeNull()
    p.play()
    vi.advanceTimersByTime(100)
    expect(p.lastTurn.value).toBe(turns[0])
    vi.advanceTimersByTime(100)
    expect(p.lastTurn.value).toBe(turns[1])
  })

  it('progress is 0..1 across the battle', () => {
    const turns = makeTurns(4)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100 }))
    expect(p.progress.value).toBe(0)
    p.play()
    vi.advanceTimersByTime(100)
    expect(p.progress.value).toBe(0.25)
    vi.advanceTimersByTime(300)
    expect(p.progress.value).toBe(1)
  })

  it('handles zero turns gracefully (no-op play)', () => {
    const p = withScope(() => useBattlePlayer([], { baseIntervalMs: 100 }))
    expect(p.totalTurns).toBe(0)
    p.play()
    expect(p.isPlaying.value).toBe(false) // no-op : nothing to schedule
    vi.advanceTimersByTime(1000)
    expect(p.currentTurnIdx.value).toBe(-1)
  })

  it('setSpeed updates speed mid-playback without losing position', () => {
    const turns = makeTurns(4)
    const p = withScope(() => useBattlePlayer(turns, { baseIntervalMs: 100 }))
    p.play()
    vi.advanceTimersByTime(100)
    expect(p.currentTurnIdx.value).toBe(0)
    p.setSpeed(4)
    expect(p.speed.value).toBe(4)
    vi.advanceTimersByTime(25) // 100/4 = 25ms
    expect(p.currentTurnIdx.value).toBe(1)
  })
})
