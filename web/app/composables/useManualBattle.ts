// Reactive wrapper around manual-battle.ts's pure functional engine.
// Handles : state ref, AI scheduling on bot turns, sound effects per turn,
// computed live HP for the UI. Components consume this with a single
// `useManualBattle({...})` call.

import {
  applyManualAction,
  chooseAiMove,
  initManualBattle,
  playerMoves,
  stateToResult,
  type AiDifficulty,
  type ManualBattleState,
} from '~/utils/manual-battle'
import { useSoundEffects } from '~/composables/useSoundEffects'
import type { BattleParticipant, BattleSide } from '~/types/api'

export interface UseManualBattleOptions {
  challenger: BattleParticipant
  defender: BattleParticipant
  seed: number
  /** Which side the human controls. Default 'challenger'. */
  humanSide?: BattleSide
  /** AI difficulty for the non-human side. */
  difficulty?: AiDifficulty
  /** Delay before the AI plays after a human move, in ms (drama beat). */
  aiDelayMs?: number
}

export function useManualBattle(opts: UseManualBattleOptions) {
  const humanSide: BattleSide = opts.humanSide ?? 'challenger'
  const difficulty: AiDifficulty = opts.difficulty ?? 'normal'
  const aiDelayMs = opts.aiDelayMs ?? 900
  const sfx = useSoundEffects()

  const state = ref<ManualBattleState>(
    initManualBattle({
      challenger: opts.challenger,
      defender: opts.defender,
      seed: opts.seed,
    }),
  )

  const isHumanTurn = computed(() => !state.value.finished && state.value.whoseTurn === humanSide)
  const movesAvailable = computed(() => playerMoves(state.value))
  const lastTurn = computed(() => {
    const turns = state.value.turns
    return turns.length > 0 ? (turns[turns.length - 1] ?? null) : null
  })
  const result = computed(() => stateToResult(state.value))

  // Convenient HP helpers for the UI.
  const challengerHp = computed(() => state.value.challenger.hp)
  const challengerMaxHp = computed(() => state.value.challenger.maxHp)
  const defenderHp = computed(() => state.value.defender.hp)
  const defenderMaxHp = computed(() => state.value.defender.maxHp)

  const humanCombatant = computed(() =>
    humanSide === 'challenger' ? state.value.challenger : state.value.defender,
  )
  const aiCombatant = computed(() =>
    humanSide === 'challenger' ? state.value.defender : state.value.challenger,
  )

  let aiTimer: ReturnType<typeof setTimeout> | null = null
  function clearAiTimer() {
    if (aiTimer !== null) {
      clearTimeout(aiTimer)
      aiTimer = null
    }
  }

  function playSfxForTurn(turn: { critical: boolean; effectiveness: number }) {
    if (turn.critical) sfx.playCritical()
    else if (turn.effectiveness >= 2) sfx.playSuperEffective()
    else sfx.playHit()
  }

  function handleFinished() {
    if (!state.value.finished) return
    if (state.value.winner === humanSide) sfx.playWin()
    else if (state.value.winner === 'draw') sfx.playDraw()
    else sfx.playDefeat()
  }

  function pickAction(moveIndex: number) {
    if (!isHumanTurn.value) return
    const next = applyManualAction(state.value, moveIndex)
    state.value = next
    const t = next.turns[next.turns.length - 1]
    if (t) playSfxForTurn(t)
    if (next.finished) {
      handleFinished()
      return
    }
    // It's now the AI's turn — schedule its move with a small delay so
    // animations breathe. Determinism is preserved (chooseAiMove uses
    // the engine's rng, which is itself seeded).
    scheduleAi()
  }

  function scheduleAi() {
    clearAiTimer()
    aiTimer = setTimeout(() => {
      if (state.value.finished) return
      if (state.value.whoseTurn === humanSide) return // safety
      const idx = chooseAiMove(state.value, difficulty)
      const next = applyManualAction(state.value, idx)
      state.value = next
      const t = next.turns[next.turns.length - 1]
      if (t) playSfxForTurn(t)
      if (next.finished) {
        handleFinished()
      } else if (state.value.whoseTurn !== humanSide) {
        // Should not happen with current rules (turns alternate strictly),
        // but guard anyway in case of future skip-turn moves.
        scheduleAi()
      }
    }, aiDelayMs)
  }

  function reset() {
    clearAiTimer()
    state.value = initManualBattle({
      challenger: opts.challenger,
      defender: opts.defender,
      seed: opts.seed,
    })
    // If the AI moves first (lower-level human), schedule its opener.
    if (state.value.whoseTurn !== humanSide && !state.value.finished) {
      scheduleAi()
    }
  }

  // Auto-start the AI if it moves first.
  onMounted(() => {
    if (state.value.whoseTurn !== humanSide && !state.value.finished) {
      scheduleAi()
    }
  })

  onUnmounted(() => {
    clearAiTimer()
  })

  return {
    // state is intentionally exposed as a plain ref (not readonly()) so
    // consumers can pass state.value.turns to components that expect a
    // mutable BattleTurn[] without TS complaining. Mutations go through
    // pickAction()/reset() — outside callers should not assign state.value
    // directly.
    state,
    result,
    isHumanTurn,
    movesAvailable,
    lastTurn,
    challengerHp,
    challengerMaxHp,
    defenderHp,
    defenderMaxHp,
    humanCombatant,
    aiCombatant,
    pickAction,
    reset,
    sfx,
  }
}
