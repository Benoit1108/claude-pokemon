<script setup lang="ts">
// Manage the optional 'retro' GameBoy color mode. @nuxtjs/color-mode only
// natively handles light/dark, so we mirror the user's preference onto a
// 'retro' class on <html> ourselves when needed. CSS selectors below use
// :root.retro to apply the DMG palette.
const colorMode = useColorMode()

if (import.meta.client) {
  watchEffect(() => {
    const root = document.documentElement
    if (colorMode.preference === 'retro') {
      root.classList.add('retro')
    } else {
      root.classList.remove('retro')
    }
  })
}
</script>

<template>
  <div class="min-h-screen surface-bg text-primary transition-colors duration-150">
    <!-- Sprint 5 — global app chrome. AppHeader is sticky top, embeds the
         primary nav tabs on desktop and the segmented theme toggle + user
         pill. BottomNav owns the same nav on mobile (md:hidden). -->
    <AppHeader />

    <!-- Bottom padding so page content clears the mobile BottomNav. Desktop
         padding stays 0 since the header takes top space only. -->
    <div class="pb-20 md:pb-0">
      <NuxtPage />
    </div>

    <BottomNav />
  </div>
</template>

<style>
/*
 * Page transition "gb-dither" — Configured globally via nuxt.config.ts
 * (app.pageTransition). The leaving page briefly desaturates + scales-in
 * while fading out, the entering page reverses it. Combined with a low-opacity
 * pixel-grid overlay during the transition, it gives a subtle GameBoy-screen
 * feel without slowing navigation. CSS-only, no JS animation lib.
 */
.gb-dither-enter-active,
.gb-dither-leave-active {
  transition:
    opacity 0.22s ease-out,
    transform 0.22s ease-out,
    filter 0.22s ease-out;
}
.gb-dither-enter-from {
  opacity: 0;
  transform: scale(0.98);
  filter: contrast(1.4) saturate(0.4);
}
.gb-dither-leave-to {
  opacity: 0;
  transform: scale(1.02);
  filter: contrast(1.4) saturate(0.4);
}

/*
 * Subtle 2px scanline-style overlay that fades in/out with the page.
 * Pure CSS pattern (alternating rgba lines), only visible at low opacity
 * during the transition.
 */
.gb-dither-enter-active::after,
.gb-dither-leave-active::after {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 100;
  background-image: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.06) 0,
    rgba(0, 0, 0, 0.06) 1px,
    transparent 1px,
    transparent 2px
  );
  opacity: 0;
  animation: gb-dither-scanlines 0.22s ease-out;
}
@keyframes gb-dither-scanlines {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 0.7;
  }
  100% {
    opacity: 0;
  }
}

/* Respect prefers-reduced-motion : flat fade, no scale/filter/scanlines. */
@media (prefers-reduced-motion: reduce) {
  .gb-dither-enter-active,
  .gb-dither-leave-active {
    transition: opacity 0.15s ease-out;
  }
  .gb-dither-enter-from,
  .gb-dither-leave-to {
    transform: none;
    filter: none;
  }
  .gb-dither-enter-active::after,
  .gb-dither-leave-active::after {
    display: none;
  }
}

/*
 * Battle juice : screen shake on critical hits. The element receives the
 * .crit-shake class and a :key bump to retrigger the keyframes on every
 * crit (Vue's render-key trick).
 */
@keyframes crit-shake {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  10% {
    transform: translate3d(-4px, 1px, 0);
  }
  20% {
    transform: translate3d(5px, -2px, 0);
  }
  30% {
    transform: translate3d(-3px, 2px, 0);
  }
  40% {
    transform: translate3d(4px, -1px, 0);
  }
  50% {
    transform: translate3d(-2px, 1px, 0);
  }
  60% {
    transform: translate3d(2px, -1px, 0);
  }
  70% {
    transform: translate3d(-1px, 0, 0);
  }
  80% {
    transform: translate3d(1px, 0, 0);
  }
}
.crit-shake {
  animation: crit-shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) both;
}
@media (prefers-reduced-motion: reduce) {
  .crit-shake {
    animation: none;
  }
}

/*
 * Retro mode — GameBoy DMG palette monochrome. Mirrors the CLI 'retro'
 * theme (lib/lib.sh : pokemon_theme_accent + pokemon_ansi_color). The
 * .retro class is applied on <html> by app.vue when colorMode.preference
 * === 'retro'. Overrides go through !important because UnoCSS shortcuts
 * already produce static color classes — pragmatic at the cost of CSS
 * specificity purity.
 */
:root.retro {
  --gb-bg: #0f380f;
  --gb-surface: #306230;
  --gb-surface-hover: #4a8042;
  --gb-border: #4a8042;
  --gb-text: #9bbc0f;
  --gb-text-dim: #8bac0f;
  --gb-text-mute: #6a8a3a;
  --gb-accent: #9bbc0f;
  background-color: var(--gb-bg);
  color: var(--gb-text);
}
:root.retro body {
  background-color: var(--gb-bg) !important;
  color: var(--gb-text) !important;
}
:root.retro .surface-bg {
  background-color: var(--gb-bg) !important;
}
:root.retro .surface-card {
  background-color: var(--gb-surface) !important;
}
:root.retro .surface-card-hover:hover {
  background-color: var(--gb-surface-hover) !important;
}
:root.retro .surface-border {
  border-color: var(--gb-border) !important;
}
:root.retro .text-primary,
:root.retro .text-zinc-100,
:root.retro .text-zinc-900 {
  color: var(--gb-text) !important;
}
:root.retro .text-secondary,
:root.retro .text-zinc-400,
:root.retro .text-zinc-600 {
  color: var(--gb-text-dim) !important;
}
:root.retro .text-muted,
:root.retro .text-zinc-500 {
  color: var(--gb-text-mute) !important;
}
:root.retro .text-accent {
  color: var(--gb-accent) !important;
}
:root.retro .bg-accent {
  background-color: var(--gb-accent) !important;
  color: var(--gb-bg) !important;
}
:root.retro .ring-accent {
  --un-ring-color: var(--gb-accent) !important;
}
:root.retro code {
  color: var(--gb-accent) !important;
}
</style>
