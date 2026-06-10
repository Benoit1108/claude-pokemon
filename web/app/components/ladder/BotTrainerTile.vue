<script setup lang="ts">
import { lineageGradient, lineageLabel } from '~/utils/lineage'
import type { BotTrainer } from '~/data/bot-trainers'

const props = defineProps<{
  bot: BotTrainer
  index: number
  isBeaten: boolean
  isLocked: boolean
  isNext: boolean
}>()

const { t } = useI18n()
const tileGradient = computed(() => lineageGradient(props.bot.lineage))
</script>

<template>
  <NuxtLink
    :to="isLocked ? '' : `/ladder/${bot.id}`"
    class="relative block card p-4 transition overflow-hidden"
    :class="{
      'opacity-50 pointer-events-none cursor-not-allowed': isLocked,
      'ring-2 ring-accent': isNext,
      'surface-card-hover': !isLocked && !isBeaten,
      'border-emerald-500/40': isBeaten,
    }"
  >
    <!-- Lineage-tinted backdrop -->
    <div
      class="absolute inset-0 pointer-events-none"
      aria-hidden="true"
      :style="{ background: tileGradient }"
    />

    <div class="relative flex items-center gap-3">
      <div class="flex-shrink-0">
        <PokemonSprite
          :lineage="bot.lineage"
          :level="bot.level"
          :is-shiny="bot.is_shiny"
          size="md"
          :idle="!isBeaten"
        />
      </div>
      <div class="flex-grow min-w-0">
        <div class="text-xs uppercase tracking-widest text-secondary truncate">
          #{{ String(index + 1).padStart(2, '0') }} · {{ bot.title }}
        </div>
        <div class="font-bold text-primary truncate">
          {{ bot.name }}
          <span v-if="bot.is_shiny" class="text-accent">★</span>
        </div>
        <div class="text-xs text-muted">{{ lineageLabel(bot.lineage) }} · Lv.{{ bot.level }}</div>
      </div>
      <div class="flex-shrink-0 text-2xl">
        <span v-if="isBeaten" :title="t('ladder.bot_tile_beaten')" class="text-emerald-500">✓</span>
        <span v-else-if="isLocked" :title="t('ladder.bot_tile_locked')" class="text-muted">🔒</span>
        <span v-else-if="isNext" :title="t('ladder.bot_tile_next')" class="text-accent">▶</span>
        <span v-else class="text-secondary">⚔️</span>
      </div>
    </div>
  </NuxtLink>
</template>
