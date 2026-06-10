// Polls /v1/arena/live/<id> on a fixed interval and exposes the latest
// LiveBattleView as a reactive ref. Stops polling automatically once the
// battle reaches a terminal state (finished / abandoned / expired) — we don't
// keep hammering the worker after the result is known.
//
// No commits here : the web doesn't hold the player's arena_secret yet (that
// arrives in Sprint 2.12 via QR-code pairing), so this is read-only.

import type { LiveBattleView } from '~/types/api'

export interface UseLiveBattleOptions {
  /** Polling interval in ms while the battle is live. Default 2000. */
  intervalMs?: number
}

export function useLiveBattle(battleId: string, opts: UseLiveBattleOptions = {}) {
  const intervalMs = opts.intervalMs ?? 2000
  const api = useApi()

  const data = ref<LiveBattleView | null>(null)
  const error = ref<string | null>(null)
  const lastFetchAt = ref<number | null>(null)

  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false

  const isTerminal = (s: string | null | undefined): boolean =>
    s === 'finished' || s === 'abandoned' || s === 'expired'

  async function tick() {
    if (stopped) return
    try {
      const res = await api.arenaLive(battleId)
      data.value = res
      error.value = null
      lastFetchAt.value = Date.now()
      if (isTerminal(res.state)) {
        // Done — let the user see the final state, no need to poll further.
        stopped = true
        return
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Échec du chargement'
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, intervalMs)
      }
    }
  }

  onMounted(() => {
    void tick()
  })

  onBeforeUnmount(() => {
    stopped = true
    if (timer) clearTimeout(timer)
  })

  function stop() {
    stopped = true
    if (timer) clearTimeout(timer)
  }

  return {
    data,
    error,
    lastFetchAt,
    stop,
  }
}
