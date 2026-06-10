<script setup lang="ts">
import { lineageEmoji } from '~/utils/lineage'
import type { BattleParticipant, BattleTurn } from '~/types/api'

const props = defineProps<{
  turns: BattleTurn[]
  challenger: BattleParticipant
  defender: BattleParticipant
}>()

const { t } = useI18n()

function effectivenessLabel(eff: number): string {
  if (eff >= 2) return t('battle_log.effectiveness_super')
  if (eff <= 0.5) return t('battle_log.effectiveness_weak')
  return ''
}

// Track the last revealed turn so only IT plays the typewriter animation.
const lastRevealedTurn = computed(() => props.turns[props.turns.length - 1]?.turn ?? -1)
</script>

<template>
  <div class="card p-4 mb-6">
    <div class="text-label mb-3">{{ t('battle_log.title') }}</div>
    <ol v-if="turns.length > 0" class="space-y-1.5 font-mono text-sm">
      <TransitionGroup name="turn-fade" tag="div" class="space-y-1.5">
        <li
          v-for="turnItem in turns"
          :key="turnItem.turn"
          class="flex flex-wrap gap-2 items-center"
          :class="{ 'turn-typewriter': turnItem.turn === lastRevealedTurn }"
        >
          <span class="text-muted w-12 tabular-nums">{{
            t('battle_log.turn_label', { n: turnItem.turn.toString().padStart(2, '0') })
          }}</span>
          <span class="text-2xl">
            {{
              lineageEmoji(turnItem.actor === 'challenger' ? challenger.lineage : defender.lineage)
            }}
          </span>
          <span class="text-primary">{{ t('battle_log.attacks_for') }}</span>
          <span class="font-bold text-accent">{{
            t('battle_log.damage_hp', { damage: turnItem.damage })
          }}</span>
          <span v-if="turnItem.effectiveness !== 1" class="text-secondary text-xs">
            {{
              t('battle_log.effectiveness_with_mult', {
                label: effectivenessLabel(turnItem.effectiveness),
                mult: turnItem.effectiveness,
              })
            }}
          </span>
          <span v-if="turnItem.critical" class="text-accent font-bold text-xs">{{
            t('battle_log.critical')
          }}</span>
          <span class="text-muted text-xs ml-auto tabular-nums">
            {{ t('battle_log.opp_hp', { hp: turnItem.defender_hp_after }) }}
          </span>
        </li>
      </TransitionGroup>
    </ol>
    <p v-else class="text-secondary text-sm italic">{{ t('battle_log.press_play') }}</p>
  </div>
</template>

<style scoped>
.turn-fade-enter-active {
  transition:
    opacity 0.35s ease-out,
    transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.turn-fade-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
@keyframes typewriter-glow {
  0% {
    background-color: rgba(255, 200, 0, 0.18);
  }
  100% {
    background-color: transparent;
  }
}
.turn-typewriter {
  animation: typewriter-glow 0.7s ease-out;
  border-radius: 4px;
  padding-left: 4px;
  margin-left: -4px;
}
</style>
