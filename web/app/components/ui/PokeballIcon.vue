<script setup lang="ts">
// Custom Pokéball icon (Sprint 2.13 UA3) — replaces the 🎮 emoji in titles.
// Pure inline SVG so it ships zero extra HTTP requests and inherits the
// surrounding text color via currentColor for the seam, while the red /
// white halves are explicit fills (an iconic pokéball without color isn't
// a pokéball). The `variant` prop swaps the top half : red (default), gold
// (shiny), navy (master).

const props = withDefaults(
  defineProps<{
    /** Icon size — picks Tailwind w-/h-. Same scale as PokemonSprite. */
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    /** Color of the upper half. */
    variant?: 'default' | 'shiny' | 'master'
    /** Slow rotation animation. Honored only when prefers-reduced-motion = no. */
    spin?: boolean
    /** Title for accessibility / hover tooltip. */
    title?: string
  }>(),
  {
    size: 'md',
    variant: 'default',
    spin: false,
    title: 'Pokéball',
  },
)

const sizeClass = computed(
  () =>
    ({
      xs: 'w-4 h-4',
      sm: 'w-5 h-5',
      md: 'w-7 h-7',
      lg: 'w-10 h-10',
      xl: 'w-14 h-14',
    })[props.size],
)

const topFill = computed(() =>
  props.variant === 'shiny' ? '#f6c945' : props.variant === 'master' ? '#5566cc' : '#e63946',
)
</script>

<template>
  <span
    :class="['inline-flex items-center justify-center align-middle', spin ? 'pokeball-spin' : '']"
    :title="title"
  >
    <svg
      :class="sizeClass"
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      :aria-label="title"
    >
      <!-- Outer circle -->
      <circle cx="32" cy="32" r="30" fill="#fff" stroke="#1a1a1a" stroke-width="3" />
      <!-- Top half (color varies with variant) -->
      <path d="M2 32 a30 30 0 0 1 60 0 Z" :fill="topFill" stroke="#1a1a1a" stroke-width="3" />
      <!-- Center seam line -->
      <line x1="2" y1="32" x2="62" y2="32" stroke="#1a1a1a" stroke-width="4" />
      <!-- Center button (white inner with dark ring) -->
      <circle cx="32" cy="32" r="9" fill="#fff" stroke="#1a1a1a" stroke-width="3" />
      <circle cx="32" cy="32" r="4" fill="#fff" stroke="#1a1a1a" stroke-width="2" />
      <!-- Subtle highlight -->
      <ellipse cx="22" cy="20" rx="6" ry="3" fill="#fff" opacity="0.45" />
    </svg>
  </span>
</template>

<style scoped>
@keyframes pokeball-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
.pokeball-spin {
  animation: pokeball-spin 4s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .pokeball-spin {
    animation: none;
  }
}
</style>
