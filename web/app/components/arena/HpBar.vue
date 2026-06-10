<script setup lang="ts">
// Thin HP bar used in manual mode to give the player live feedback on
// remaining HP. Color shifts green → yellow → red as HP drops.

const props = defineProps<{
  hp: number
  maxHp: number
  label?: string
}>()

const pct = computed(() => Math.max(0, Math.min(1, props.hp / props.maxHp)))
const barColor = computed(() => {
  if (pct.value > 0.5) return 'bg-emerald-500'
  if (pct.value > 0.25) return 'bg-yellow-500'
  return 'bg-red-500'
})
</script>

<template>
  <div class="w-full">
    <div v-if="label" class="flex justify-between text-xs text-secondary mb-1">
      <span>{{ label }}</span>
      <span class="tabular-nums">{{ hp }} / {{ maxHp }}</span>
    </div>
    <div class="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
      <div
        class="h-full transition-all duration-500 ease-out"
        :class="barColor"
        :style="{ width: `${pct * 100}%` }"
      />
    </div>
  </div>
</template>
