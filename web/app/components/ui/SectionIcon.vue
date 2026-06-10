<script setup lang="ts">
// Sprint 5 — single SVG icon component for the 4 gameplay sections. Replaces
// emoji (📖 ⚔️ 🗺️ 🏞️) which render differently on Mac/Win/Linux. Uses
// `currentColor` so they pick up parent text color without prop juggling.
//
// Stroke-based Lucide-style icons (24×24 viewBox, 2px stroke, round caps).

withDefaults(
  defineProps<{
    name: 'pokedex' | 'arena' | 'trail' | 'zones' | 'profile'
    /** Pixel size — applied to width/height. */
    size?: number | string
    /** stroke-width override (default 2). */
    stroke?: number
  }>(),
  {
    size: 24,
    stroke: 2,
  },
)
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    stroke="currentColor"
    aria-hidden="true"
  >
    <!-- POKÉDEX — book / device with seam and lens -->
    <template v-if="name === 'pokedex'">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 12h18" />
      <circle cx="8" cy="7.5" r="1.5" />
      <path d="M14 7h4" />
      <path d="M14 9.5h4" />
      <path d="M7 16h10" />
      <path d="M7 18.5h6" />
    </template>

    <!-- ARENA — crossed swords -->
    <template v-else-if="name === 'arena'">
      <path d="M14.5 17.5 4 7V4h3l10.5 10.5" />
      <path d="m13 19 2 2" />
      <path d="m16 16 4 4" />
      <path d="M19.5 10.5 21 9l-1.5-1.5L21 6V4h-3l-1.5 1.5L15 4" />
      <path d="M14.5 6.5 9 12" />
    </template>

    <!-- TRAIL — mountain peaks with sun -->
    <template v-else-if="name === 'trail'">
      <path d="M8 3 4 17l3 3h10l3-3-4-14" />
      <path d="m4 17 5-7 3 4 3-3 5 6" />
      <circle cx="16" cy="6" r="1.5" />
    </template>

    <!-- ZONES — folded map with pins -->
    <template v-else-if="name === 'zones'">
      <path d="M3 6v15l6-3 6 3 6-3V3l-6 3-6-3-6 3" />
      <path d="M9 3v15" />
      <path d="M15 6v15" />
    </template>

    <!-- PROFILE — trainer head silhouette (used in bottom-nav) -->
    <template v-else-if="name === 'profile'">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.5 3.5-8 8-8s8 3.5 8 8" />
    </template>
  </svg>
</template>
