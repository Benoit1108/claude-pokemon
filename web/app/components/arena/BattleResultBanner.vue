<script setup lang="ts">
import { trainerLabel } from '~/utils/format'
import type { BattleParticipant } from '~/types/api'

const props = defineProps<{
  winner: 'challenger' | 'defender' | 'draw'
  reason: 'ko' | 'turn_limit'
  challenger: BattleParticipant
  defender: BattleParticipant
  totalTurns: number
}>()

const { t } = useI18n()

const winnerLabel = computed(() => {
  if (props.winner === 'draw') return null
  return props.winner === 'challenger'
    ? trainerLabel(props.challenger)
    : trainerLabel(props.defender)
})
</script>

<template>
  <div
    class="text-center surface-card border-2 surface-border rounded-lg p-6 mb-6"
    :class="winner !== 'draw' ? 'ring-2 ring-accent/50' : ''"
  >
    <div v-if="winner === 'draw'" class="text-2xl font-bold text-secondary">
      {{ t('battle_result.draw_short') }}
    </div>
    <div v-else>
      <div class="text-3xl mb-1">
        {{ winner === 'challenger' ? '⚔️' : '🛡️' }}
      </div>
      <div class="text-2xl font-bold text-accent">
        {{ t('battle_result.wins', { name: winnerLabel }) }}
      </div>
    </div>
    <div class="text-sm text-secondary mt-2">
      {{
        totalTurns === 1
          ? t('battle_result.turn_count_one')
          : t('battle_result.turn_count_many', { count: totalTurns })
      }}
      <span v-if="reason === 'ko'">{{ t('battle_result.ko_label') }}</span>
      <span v-else>{{ t('battle_result.turn_limit_label') }}</span>
    </div>
  </div>
</template>
