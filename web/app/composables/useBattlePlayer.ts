// Battle replay playback controller. Reveals turns one at a time with
// adjustable speed, exposes the "currently animating" turn so child
// components can sync their visual feedback (sprite bounce, screen shake,
// crit flash). UI-agnostic — just state + transitions.

import type { BattleTurn } from '~/types/api'

export type PlaybackSpeed = 0.5 | 1 | 2 | 4

export interface UseBattlePlayerOptions {
  autoPlay?: boolean
  speed?: PlaybackSpeed
  /** Base interval between turn reveals at speed=1×, in ms. */
  baseIntervalMs?: number
}

export function useBattlePlayer(turns: BattleTurn[], opts: UseBattlePlayerOptions = {}) {
  const totalTurns = turns.length
  const baseInterval = opts.baseIntervalMs ?? 900

  // currentTurnIdx ∈ [-1, totalTurns - 1]
  //   -1 = pre-battle (nothing revealed yet)
  //   0..totalTurns-1 = turn revealed
  const currentTurnIdx = ref(-1)
  const isPlaying = ref(false)
  const speed = ref<PlaybackSpeed>(opts.speed ?? 1)
  let timer: ReturnType<typeof setTimeout> | null = null

  const visibleTurns = computed(() =>
    currentTurnIdx.value < 0 ? [] : turns.slice(0, currentTurnIdx.value + 1),
  )
  const lastTurn = computed(() =>
    currentTurnIdx.value >= 0 ? (turns[currentTurnIdx.value] ?? null) : null,
  )
  const isFinished = computed(() => currentTurnIdx.value >= totalTurns - 1)
  const progress = computed(() =>
    totalTurns === 0 ? 0 : Math.max(0, currentTurnIdx.value + 1) / totalTurns,
  )

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function scheduleNext() {
    clearTimer()
    if (!isPlaying.value || isFinished.value) return
    timer = setTimeout(() => {
      currentTurnIdx.value = Math.min(currentTurnIdx.value + 1, totalTurns - 1)
      if (isFinished.value) {
        isPlaying.value = false
        clearTimer()
      } else {
        scheduleNext()
      }
    }, baseInterval / speed.value)
  }

  function play() {
    if (totalTurns === 0) return
    if (isFinished.value) {
      currentTurnIdx.value = -1
    }
    isPlaying.value = true
    scheduleNext()
  }

  function pause() {
    isPlaying.value = false
    clearTimer()
  }

  function toggle() {
    if (isPlaying.value) pause()
    else play()
  }

  function skipToEnd() {
    pause()
    currentTurnIdx.value = totalTurns - 1
  }

  function restart() {
    pause()
    currentTurnIdx.value = -1
    nextTick(() => play())
  }

  function setSpeed(s: PlaybackSpeed) {
    speed.value = s
    if (isPlaying.value) {
      // re-schedule the next reveal at the new speed without losing position
      clearTimer()
      scheduleNext()
    }
  }

  // Auto-play on mount if requested.
  onMounted(() => {
    if (opts.autoPlay && totalTurns > 0) play()
  })
  onUnmounted(() => {
    clearTimer()
  })

  return {
    currentTurnIdx,
    isPlaying,
    speed,
    visibleTurns,
    lastTurn,
    isFinished,
    progress,
    totalTurns,
    play,
    pause,
    toggle,
    skipToEnd,
    restart,
    setSpeed,
  }
}
