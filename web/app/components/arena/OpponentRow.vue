<script setup lang="ts">
import { lineageLabel } from '~/utils/lineage'
import { trainerLabel } from '~/utils/format'
import type { ArenaOpponent } from '~/types/api'

defineProps<{
  opponent: ArenaOpponent
}>()
</script>

<template>
  <NuxtLink
    :to="`/trainer/${opponent.anon_id}`"
    class="block card p-3 transition surface-card-hover"
    :class="opponent.is_shiny ? 'ring-1 ring-accent' : ''"
  >
    <div class="flex items-center gap-3">
      <PokemonSprite
        :lineage="opponent.lineage"
        :level="opponent.level"
        :is-shiny="opponent.is_shiny"
        size="md"
        idle
      />
      <div class="flex-grow min-w-0">
        <div class="font-semibold text-primary truncate">
          {{ trainerLabel(opponent) }}
          <span v-if="opponent.is_shiny" class="text-accent">★</span>
        </div>
        <div class="text-xs text-secondary">
          {{ lineageLabel(opponent.lineage) }}
        </div>
      </div>
      <div class="text-right">
        <div class="font-bold text-primary tabular-nums">Lv.{{ opponent.level }}</div>
      </div>
    </div>
  </NuxtLink>
</template>
