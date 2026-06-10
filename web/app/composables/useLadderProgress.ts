// Track which ladder bots the user has beaten, locally.
// localStorage-only for now — Worker sync (cross-device) deferred to later
// (Sprint 2.6+). The localStorage shape is intentionally narrow so future
// migrations are simple.
//
// State :
//   { beaten: { [bot_id]: { turns: N, won_at: ISO, seed: number } }, version: 1 }

import { BOT_TRAINERS } from '~/data/bot-trainers'

const STORAGE_KEY = 'arena-ladder-progress'
const SCHEMA_VERSION = 1

export interface LadderEntry {
  turns: number
  won_at: string
  seed: number
}

export interface LadderState {
  version: number
  beaten: Record<string, LadderEntry>
}

function emptyState(): LadderState {
  return { version: SCHEMA_VERSION, beaten: {} }
}

function readStorage(): LadderState {
  if (typeof localStorage === 'undefined') return emptyState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<LadderState>
    if (parsed.version !== SCHEMA_VERSION) return emptyState()
    return {
      version: SCHEMA_VERSION,
      beaten: parsed.beaten ?? {},
    }
  } catch {
    return emptyState()
  }
}

function writeStorage(state: LadderState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* localStorage blocked (private mode, quota) — silently ignore */
  }
}

export function useLadderProgress() {
  const state = ref<LadderState>(emptyState())

  onMounted(() => {
    state.value = readStorage()
  })

  function isBeaten(botId: string): boolean {
    return botId in state.value.beaten
  }

  function recordVictory(botId: string, turns: number, seed: number): void {
    const entry: LadderEntry = {
      turns,
      won_at: new Date().toISOString(),
      seed,
    }
    state.value = {
      ...state.value,
      beaten: { ...state.value.beaten, [botId]: entry },
    }
    writeStorage(state.value)
  }

  function reset(): void {
    state.value = emptyState()
    writeStorage(state.value)
  }

  /**
   * Index of the next bot to challenge (0-based). Uses BOT_TRAINERS' static
   * order — first bot whose id is not in `beaten`. Returns -1 if all beaten.
   */
  const nextIndex = computed(() => {
    for (let i = 0; i < BOT_TRAINERS.length; i++) {
      if (!isBeaten(BOT_TRAINERS[i]!.id)) return i
    }
    return -1
  })

  const beatenCount = computed(() => Object.keys(state.value.beaten).length)
  const totalCount = BOT_TRAINERS.length
  const isComplete = computed(() => beatenCount.value >= totalCount)
  const progress = computed(() => beatenCount.value / totalCount)

  return {
    state: readonly(state),
    isBeaten,
    recordVictory,
    reset,
    nextIndex,
    beatenCount,
    totalCount,
    isComplete,
    progress,
  }
}
