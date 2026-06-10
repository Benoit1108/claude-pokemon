<script setup lang="ts">
// 2x2 grid of move buttons, shown during the player's turn in manual mode.
// Each button is tinted by the move's type and tagged with a super-effective
// / not-very-effective hint based on the defender's type (so the player can
// learn the matchup chart).

import { TYPE_CHART, type CombatType } from '~/utils/battle-engine'
import type { Move } from '~/data/moves'

const props = defineProps<{
  moves: Move[]
  defenderType: CombatType
  disabled?: boolean
}>()

const emit = defineEmits<{
  pick: [moveIndex: number]
}>()

const { t } = useI18n()

const TYPE_BG: Record<CombatType, string> = {
  normal: 'bg-zinc-500/20 border-zinc-500/40 hover:bg-zinc-500/30',
  fire: 'bg-orange-500/20 border-orange-500/40 hover:bg-orange-500/30',
  water: 'bg-blue-500/20 border-blue-500/40 hover:bg-blue-500/30',
  electric: 'bg-yellow-400/20 border-yellow-400/40 hover:bg-yellow-400/30',
  grass: 'bg-green-500/20 border-green-500/40 hover:bg-green-500/30',
  ice: 'bg-cyan-400/20 border-cyan-400/40 hover:bg-cyan-400/30',
  fighting: 'bg-red-600/20 border-red-600/40 hover:bg-red-600/30',
  poison: 'bg-purple-500/20 border-purple-500/40 hover:bg-purple-500/30',
  ground: 'bg-amber-600/20 border-amber-600/40 hover:bg-amber-600/30',
  flying: 'bg-indigo-400/20 border-indigo-400/40 hover:bg-indigo-400/30',
  psychic: 'bg-pink-500/20 border-pink-500/40 hover:bg-pink-500/30',
  bug: 'bg-lime-500/20 border-lime-500/40 hover:bg-lime-500/30',
  rock: 'bg-stone-500/20 border-stone-500/40 hover:bg-stone-500/30',
  ghost: 'bg-violet-600/20 border-violet-600/40 hover:bg-violet-600/30',
  dragon: 'bg-indigo-600/20 border-indigo-600/40 hover:bg-indigo-600/30',
  dark: 'bg-neutral-700/20 border-neutral-700/40 hover:bg-neutral-700/30',
  steel: 'bg-slate-500/20 border-slate-500/40 hover:bg-slate-500/30',
  fairy: 'bg-fuchsia-400/20 border-fuchsia-400/40 hover:bg-fuchsia-400/30',
}

const typeLabel = (type: CombatType): string => t(`attack_picker.type_${type}`)

function effectivenessFor(move: Move): number {
  return TYPE_CHART[move.type][props.defenderType]
}

function effectivenessLabel(eff: number): { text: string; color: string } {
  if (eff >= 2) return { text: t('attack_picker.super_eff'), color: 'text-success' }
  if (eff <= 0.5) return { text: t('attack_picker.weak_eff'), color: 'text-danger' }
  return { text: t('attack_picker.neutral_eff'), color: 'text-zinc-400' }
}
</script>

<template>
  <div class="card p-4 mb-4">
    <div class="text-label mb-3 text-center">{{ t('attack_picker.title') }}</div>
    <div class="grid grid-cols-2 gap-2">
      <button
        v-for="(move, i) in moves"
        :key="i"
        type="button"
        :disabled="disabled"
        class="border rounded-md px-3 py-3 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
        :class="TYPE_BG[move.type]"
        @click="!disabled && emit('pick', i)"
      >
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <span class="font-bold text-primary truncate">{{ move.name }}</span>
          <span class="text-xs uppercase tracking-wider text-secondary flex-shrink-0">
            {{ typeLabel(move.type) }}
          </span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-muted">{{
            t('attack_picker.power', { value: move.power.toFixed(1) })
          }}</span>
          <span :class="effectivenessLabel(effectivenessFor(move)).color">
            {{ effectivenessLabel(effectivenessFor(move)).text }}
          </span>
        </div>
      </button>
    </div>
  </div>
</template>
