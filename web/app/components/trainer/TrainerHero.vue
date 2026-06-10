<script setup lang="ts">
import { lineageLabel as resolveLineageLabel, lineageAccent } from '~/utils/lineage'
import { badgeMeta } from '~/utils/badges'
import type { TrainerResponse } from '~/types/api'

const props = defineProps<{
  trainer: TrainerResponse
}>()

const { t } = useI18n()

const label = computed(() =>
  props.trainer.display_name
    ? `${props.trainer.display_name}#${props.trainer.anon_id.slice(0, 4)}`
    : props.trainer.anon_id,
)

const lineage = computed(() => props.trainer.stats.active.lineage)
const level = computed(() => props.trainer.stats.active.current_level)
const isShiny = computed(() => props.trainer.stats.active.is_shiny)
const lineageLabel = computed(() => resolveLineageLabel(lineage.value))

// Lineage-derived accent color drives the sprite ring + pinned-badge borders
// to give each profile a distinct flavor without a heavy theme system.
const accent = computed(() => lineageAccent(lineage.value))

// Bio is rendered line-by-line (≤4 lines) so each \n in the source becomes a
// real <br>-separated paragraph. Falls back gracefully when null.
const bioLines = computed(() => {
  if (!props.trainer.bio) return []
  return props.trainer.bio.split('\n').slice(0, 4)
})

// Pinned badges (≤3) — only render the ones the user actually owns. The
// worker already enforces this, but defense in depth keeps stale displays
// safe if the public profile is ever cached.
const ownedSet = computed(() => new Set(props.trainer.stats.badges))
const pinned = computed(() =>
  (props.trainer.pinned_badges ?? []).filter(id => ownedSet.value.has(id)).slice(0, 3),
)
</script>

<template>
  <header class="text-center mb-12">
    <div
      class="inline-block px-3 py-1 mb-4 text-xs uppercase tracking-widest border surface-border rounded-full text-secondary"
    >
      {{ t('trainer.card_label') }}
    </div>

    <div class="flex justify-center mb-4">
      <div
        class="rounded-full p-1.5 transition"
        :style="{ boxShadow: `0 0 0 2px ${accent}, 0 4px 18px ${accent}33` }"
      >
        <PokemonSprite
          v-if="lineage"
          :lineage="lineage"
          :level="level"
          :is-shiny="isShiny"
          size="xl"
          animated
        />
      </div>
    </div>

    <h1
      class="text-4xl md:text-5xl font-bold mb-2 text-primary flex items-center justify-center gap-2"
    >
      <PokeballIcon size="lg" :variant="isShiny ? 'shiny' : 'default'" />
      <span>{{ label }}</span>
      <span v-if="isShiny" class="text-accent" :title="t('trainer.active_companion_shiny')">✦</span>
    </h1>

    <p class="text-lg text-secondary">
      {{ lineageLabel }} ·
      {{ level === 0 ? '🥚 Egg' : `Lv.${level}` }}
    </p>

    <p
      v-if="trainer.quote"
      class="mt-3 text-sm italic text-muted max-w-xl mx-auto"
      :title="t('trainer.quote_title')"
    >
      💬 "{{ trainer.quote }}"
    </p>

    <div
      v-if="bioLines.length"
      class="mt-3 text-sm text-secondary max-w-xl mx-auto whitespace-pre-line"
      :title="t('trainer.bio_title')"
    >
      <span v-for="(line, idx) in bioLines" :key="idx" class="block">{{ line }}</span>
    </div>

    <div v-if="pinned.length" class="mt-5 flex justify-center gap-3 flex-wrap">
      <div
        v-for="id in pinned"
        :key="id"
        class="px-3 py-2 rounded-md surface-card border flex items-center gap-2"
        :style="{ borderColor: accent }"
        :title="`${badgeMeta(id).label} — ${badgeMeta(id).description}`"
      >
        <span class="text-xl">{{ badgeMeta(id).emoji }}</span>
        <span class="text-xs uppercase tracking-wide font-semibold" :style="{ color: accent }">
          {{ badgeMeta(id).label }}
        </span>
      </div>
    </div>
  </header>
</template>
