<script setup lang="ts">
// Phase 2.11 — "Pokédex achievements" section on the public trainer card.
// Pure client-side derivation from the trainer's seen species ids.
import { computePokedexAchievements } from '~/utils/pokedex-achievements'
import type { WildPokemon } from '~/types/pokedex'

const props = defineProps<{
  seenIds?: string[]
}>()

const { t, locale } = useI18n()

const ach = computed(() => computePokedexAchievements(props.seenIds))

// Species name in the active locale (the WildPokemon data carries both).
const legName = (leg: WildPokemon) => (locale.value === 'en' ? leg.name_en : leg.name_fr)

// Milestone emoji (label comes from i18n `trainer.pokedex_ms_<key>`).
const MILESTONE_EMOJI: Record<string, string> = {
  pct_25: '📗',
  pct_50: '📘',
  pct_100: '🏆',
  gen1_starters: '🔰',
  saw_rare: '💎',
  saw_legendary: '🌟',
}
</script>

<template>
  <section class="mb-12">
    <h2 class="text-label mb-3">
      {{ t('trainer.pokedex_ach_title') }}
      <span class="text-accent">{{ ach.seen }}/{{ ach.total }}</span>
      <span class="text-muted text-sm">· {{ ach.pct }}%</span>
    </h2>

    <div class="card p-4 space-y-5">
      <!-- Global + per-generation completion bars. -->
      <div class="space-y-3">
        <div v-for="g in ach.perGen" :key="g.gen" class="flex items-center gap-3">
          <span class="text-xs uppercase tracking-widest text-secondary w-16 shrink-0">
            {{ t('trainer.pokedex_gen', { gen: g.gen }) }}
          </span>
          <div class="flex-1 h-2.5 rounded-full bg-black/30 overflow-hidden">
            <div
              class="h-full rounded-full bg-accent transition-all"
              :style="{ width: `${g.pct}%` }"
            />
          </div>
          <span class="text-xs text-secondary w-16 shrink-0 text-right"
            >{{ g.seen }}/{{ g.total }}</span
          >
        </div>
      </div>

      <!-- Milestone badges. -->
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-3">
        <div
          v-for="m in ach.milestones"
          :key="m.key"
          class="text-center p-2.5 rounded-md border surface-border transition"
          :class="m.achieved ? 'surface-card-hover' : 'opacity-30 grayscale'"
          :title="t(`trainer.pokedex_ms_${m.key}`)"
        >
          <div class="text-2xl mb-1">{{ MILESTONE_EMOJI[m.key] }}</div>
          <div class="text-[0.65rem] leading-tight text-secondary">
            {{ t(`trainer.pokedex_ms_${m.key}`) }}
          </div>
        </div>
      </div>

      <!-- Legendaries seen. -->
      <div>
        <div class="text-xs uppercase tracking-widest text-secondary mb-2">
          {{ t('trainer.pokedex_legendaries') }}
          <span class="text-accent">{{ ach.legendariesSeen.length }}</span>
        </div>
        <div v-if="ach.legendariesSeen.length" class="flex flex-wrap gap-2">
          <div
            v-for="leg in ach.legendariesSeen"
            :key="leg.id"
            class="flex flex-col items-center w-16"
            :title="legName(leg)"
          >
            <PokemonSprite :lineage="leg.id" :level="50" size="md" />
            <span class="text-[0.6rem] text-muted truncate w-full text-center">{{
              legName(leg)
            }}</span>
          </div>
        </div>
        <p v-else class="text-sm text-muted">{{ t('trainer.pokedex_no_legendary') }}</p>
      </div>
    </div>
  </section>
</template>
