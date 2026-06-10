<script setup lang="ts">
// Pokémon Black/White-inspired HP "pill" : a name+level header line, then a
// thin bar that shifts green→yellow→red as HP drops. Used in the BattleStage
// (Sprint 2.13 UA1) above each combatant.

const props = defineProps<{
  name: string
  level: number
  isShiny?: boolean
  hp: number
  maxHp: number
  /** Side hint just for the rounded-corner orientation in BW games. */
  side: 'challenger' | 'defender'
}>()

const { t } = useI18n()

const pct = computed(() => Math.max(0, Math.min(1, props.hp / props.maxHp)))
const barColor = computed(() => {
  if (pct.value > 0.5) return 'bg-emerald-400'
  if (pct.value > 0.2) return 'bg-yellow-400'
  return 'bg-red-500'
})
</script>

<template>
  <div
    class="card rounded-md px-3 py-2 shadow-md"
    :class="side === 'challenger' ? 'rounded-bl-2xl' : 'rounded-tr-2xl'"
  >
    <div class="flex items-baseline justify-between gap-3">
      <span class="font-bold text-primary text-sm truncate max-w-[8rem]">
        {{ name }}<span v-if="isShiny" class="text-accent">✦</span>
      </span>
      <span class="text-xs text-muted tabular-nums">Lv.{{ level }}</span>
    </div>
    <div class="mt-1 flex items-center gap-2">
      <span class="text-[10px] tracking-widest text-secondary font-bold">{{
        t('battle_stage.hp_label')
      }}</span>
      <div class="flex-1 h-1.5 bg-zinc-300/60 dark:bg-zinc-800/60 rounded-full overflow-hidden">
        <div
          class="h-full transition-all duration-500 ease-out"
          :class="barColor"
          :style="{ width: `${pct * 100}%` }"
        />
      </div>
    </div>
    <div class="text-right text-[10px] tabular-nums text-muted mt-0.5">{{ hp }} / {{ maxHp }}</div>
  </div>
</template>
