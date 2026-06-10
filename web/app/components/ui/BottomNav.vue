<script setup lang="ts">
// Sprint 5 — mobile bottom navigation. md:hidden, fixed bottom-0, 5 SVG-
// iconed entries (the 4 gameplay sections + Profil). Active state lifts
// the icon 2px and shows a gradient pill below it (gold → fire) with a
// soft glow. Safe-area inset for notched devices.
//
// Mockup reference : docs/mockups/sprint-5/03-mobile.html.

const route = useRoute()
const { t } = useI18n()

interface Entry {
  to: string
  labelKey: string
  icon: 'pokedex' | 'arena' | 'trail' | 'zones' | 'profile'
  match: string[]
}
const entries: Entry[] = [
  { to: '/pokedex', labelKey: 'bottom_nav.pokedex', icon: 'pokedex', match: ['/pokedex'] },
  {
    to: '/arena',
    labelKey: 'bottom_nav.arena',
    icon: 'arena',
    match: ['/arena', '/battle'],
  },
  { to: '/zones', labelKey: 'bottom_nav.zones', icon: 'zones', match: ['/zones'] },
  { to: '/ladder', labelKey: 'bottom_nav.trail', icon: 'trail', match: ['/ladder'] },
  {
    to: '/profile',
    labelKey: 'bottom_nav.profile',
    icon: 'profile',
    match: ['/profile', '/trainer', '/pair', '/signup', '/login'],
  },
]

function isActive(entry: Entry): boolean {
  return entry.match.some(prefix => route.path === prefix || route.path.startsWith(`${prefix}/`))
}
</script>

<template>
  <nav
    class="bottom-nav md:hidden fixed bottom-0 left-0 right-0 z-40 surface-overlay backdrop-blur-md backdrop-saturate-150 border-t surface-border"
    :aria-label="t('header.brand_aria')"
  >
    <div class="grid grid-cols-5">
      <NuxtLink
        v-for="entry in entries"
        :key="entry.to"
        :to="entry.to"
        class="bnav-item"
        :aria-current="isActive(entry) ? 'page' : undefined"
      >
        <SectionIcon :name="entry.icon" :size="22" :stroke="2" />
        <span class="text-[10px] font-medium leading-none">{{ t(entry.labelKey) }}</span>
      </NuxtLink>
    </div>
    <div class="safe-area-inset" />
  </nav>
</template>

<style scoped>
.bottom-nav {
  height: calc(64px + env(safe-area-inset-bottom));
}
.safe-area-inset {
  height: env(safe-area-inset-bottom);
}
.bnav-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-height: 44px;
  padding: 6px 4px 8px;
  color: rgb(113 113 122); /* zinc-500 */
  transition: color 200ms cubic-bezier(0.16, 1, 0.3, 1);
  text-decoration: none;
}
:global(html.dark .bnav-item) {
  color: rgb(161 161 170);
}
.bnav-item:hover {
  color: rgb(82 82 91);
}
:global(html.dark .bnav-item:hover) {
  color: rgb(228 228 231);
}
.bnav-item svg {
  transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.bnav-item[aria-current='page'] {
  color: rgb(24 24 27);
}
:global(html.dark .bnav-item[aria-current='page']) {
  color: rgb(244 244 245);
}
.bnav-item[aria-current='page'] svg {
  transform: translateY(-2px);
}
.bnav-item[aria-current='page']::after {
  content: '';
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 28px;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, #d4a017, #ef6c00);
  box-shadow: 0 0 12px -2px #d4a017;
}
:global(html.dark .bnav-item[aria-current='page']::after) {
  background: linear-gradient(90deg, #ffd700, #ef6c00);
  box-shadow: 0 0 12px -2px #ffd700;
}
@media (prefers-reduced-motion: reduce) {
  .bnav-item svg {
    transition: none;
  }
}
</style>
