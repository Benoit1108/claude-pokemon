// Battle juice pack — confetti on victory, screen shake on crit, floating
// damage numbers, particle bursts. Centralized so any battle page (PvP
// replay, ladder auto, ladder manual) can opt in by calling useBattleJuice
// once and feeding it the player's reactive state.
//
// SSR-safe : every dynamic import / DOM mutation is gated by import.meta.client.

import type { BattleSide, BattleTurn } from '~/types/api'

export interface UseBattleJuiceOptions {
  /**
   * Reactive ref to the latest turn played. The composable watches it and
   * triggers per-turn juice (shake on crit, floating damage on hit).
   */
  lastTurn: Readonly<Ref<BattleTurn | null>>
  /**
   * Reactive ref to whether the battle is finished. When it transitions
   * to `true`, fires winner-side confetti.
   */
  isFinished: Readonly<Ref<boolean>>
  /** Reactive ref to the winner once finished. */
  winner: Readonly<Ref<BattleSide | 'draw' | null | undefined>>
  /** Side that the local human is rooting for (for confetti color). */
  cheerSide?: BattleSide
}

export interface FloatingDamage {
  id: number
  side: BattleSide
  damage: number
  effectiveness: number
  critical: boolean
}

export function useBattleJuice(opts: UseBattleJuiceOptions) {
  const cheer = opts.cheerSide ?? 'challenger'
  const shakeKey = ref(0) // bump to retrigger shake CSS animation
  const floatingDamages = ref<FloatingDamage[]>([])
  let nextFloatId = 1

  // Watch every new turn → shake (if crit) + add floating damage.
  watch(opts.lastTurn, (turn, prev) => {
    if (!turn) return
    if (prev && prev.turn === turn.turn) return // same turn re-render, skip
    if (turn.critical) {
      shakeKey.value++
    }
    // Defender side = opposite of actor.
    const defenderSide: BattleSide = turn.actor === 'challenger' ? 'defender' : 'challenger'
    const id = nextFloatId++
    floatingDamages.value = [
      ...floatingDamages.value,
      {
        id,
        side: defenderSide,
        damage: turn.damage,
        effectiveness: turn.effectiveness,
        critical: turn.critical,
      },
    ]
    // Auto-remove after the float animation finishes (1.4 s).
    setTimeout(() => {
      floatingDamages.value = floatingDamages.value.filter(f => f.id !== id)
    }, 1400)
  })

  // Watch finished → fire confetti once.
  let confettiFired = false
  watch(opts.isFinished, finished => {
    if (!finished || confettiFired) return
    confettiFired = true
    if (opts.winner.value === cheer && import.meta.client) {
      void fireConfetti()
    }
  })

  async function fireConfetti() {
    const mod = await import('canvas-confetti')
    const confetti = mod.default
    const fire = (particleRatio: number, opts: confetti.Options) => {
      confetti({
        origin: { y: 0.6 },
        ...opts,
        particleCount: Math.floor(200 * particleRatio),
      })
    }
    // Multi-burst pattern from canvas-confetti README — feels celebratory
    // without overwhelming the page.
    fire(0.25, { spread: 26, startVelocity: 55 })
    fire(0.2, { spread: 60 })
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 })
    fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 })
    fire(0.1, { spread: 120, startVelocity: 45 })
  }

  return {
    shakeKey,
    floatingDamages,
    fireConfetti,
  }
}
