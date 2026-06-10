<script setup lang="ts">
// Sprite renderer that hot-links Pokémon Showdown PNG / animated GIF, with
// graceful emoji fallback if the image fails to load.
//
// Used everywhere a Pokémon is displayed : leaderboard, opponent rows,
// battle scene, pokédex card, trainer hero. The `idle` prop adds a slow
// vertical bounce so static lists feel alive.

import { spriteUrl, stageNameFor } from '~/utils/sprites'
import { lineageEmoji } from '~/utils/lineage'

const props = withDefaults(
  defineProps<{
    lineage: string
    level: number
    isShiny?: boolean
    /** Visual size — picks Tailwind w-/h- + emoji font-size in fallback. */
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
    /** Animated GIF (gen5+ only). Otherwise static gen5 PNG. */
    animated?: boolean
    /** Slow yoyo bounce for non-active sprites in lists. */
    idle?: boolean
    /** Sprint 2.13 UA1 — back-view sprite (BW arena style). */
    back?: boolean
  }>(),
  {
    isShiny: false,
    size: 'md',
    animated: false,
    idle: false,
    back: false,
  },
)

const failed = ref(false)
const url = computed(() =>
  spriteUrl({
    lineage: props.lineage,
    level: props.level,
    isShiny: props.isShiny,
    animated: props.animated,
    back: props.back,
  }),
)
const name = computed(() => stageNameFor(props.lineage, props.level))

const wrapperClass = computed(
  () =>
    ({
      xs: 'w-6 h-6',
      sm: 'w-10 h-10',
      md: 'w-16 h-16',
      lg: 'w-24 h-24',
      xl: 'w-32 h-32',
      '2xl': 'w-44 h-44',
    })[props.size],
)

const fallbackFontClass = computed(
  () =>
    ({
      xs: 'text-base',
      sm: 'text-2xl',
      md: 'text-4xl',
      lg: 'text-5xl',
      xl: 'text-7xl',
      '2xl': 'text-8xl',
    })[props.size],
)
</script>

<template>
  <div
    :class="[
      wrapperClass,
      'inline-flex items-center justify-center select-none',
      idle ? 'sprite-yoyo' : '',
    ]"
  >
    <img
      v-if="!failed"
      :src="url"
      :alt="name"
      :title="name"
      loading="lazy"
      decoding="async"
      class="w-full h-full object-contain pixel-render"
      @error="failed = true"
    />
    <span v-else :class="[fallbackFontClass, 'leading-none']" :title="name" aria-hidden="true">
      {{ lineageEmoji(lineage) }}
    </span>
  </div>
</template>

<style scoped>
@keyframes sprite-yoyo {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-3px);
  }
}
.sprite-yoyo {
  animation: sprite-yoyo 2.5s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .sprite-yoyo {
    animation: none;
  }
}
</style>
