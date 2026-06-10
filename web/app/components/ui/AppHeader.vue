<script setup lang="ts">
// Sprint 5 — global app header. Sticky 56px, backdrop-blur, three clusters :
// left (brand + version pill + GitHub stars pill), centre (4 nav tabs),
// right (theme segmented toggle + lang switch + user pill). The 4 nav tabs
// duplicate as the gameplay sections — on mobile they collapse and
// BottomNav takes over.

const route = useRoute()
const runtimeConfig = useRuntimeConfig()
const { t, locale, locales, setLocale } = useI18n()

interface Tab {
  to: string
  labelKey: string
  match: string[]
}
const tabs: Tab[] = [
  { to: '/pokedex', labelKey: 'header.tab_pokedex', match: ['/pokedex'] },
  { to: '/arena', labelKey: 'header.tab_arena', match: ['/arena', '/battle'] },
  { to: '/ladder', labelKey: 'header.tab_trail', match: ['/ladder'] },
  { to: '/zones', labelKey: 'header.tab_zones', match: ['/zones'] },
]

// Locales available for the FR/EN switch chip. Cast keeps the chip type-safe
// against the @nuxtjs/i18n LocaleObject shape (code + name).
const availableLocales = computed(() =>
  (locales.value as { code: string; name: string }[]).filter(l => l.code !== locale.value),
)

async function switchLocale(code: string): Promise<void> {
  await setLocale(code as 'fr' | 'en')
}

function isActive(tab: Tab): boolean {
  return tab.match.some(prefix => route.path === prefix || route.path.startsWith(`${prefix}/`))
}

// Version pill — read at build time via env (set by Nuxt automatically
// from package.json when running npm scripts).
const version = computed(() => runtimeConfig.public.version || '0.x')

// GitHub stars — populated at build time by scripts/fetch-github-stars.mjs
// into runtimeConfig.public.githubStars. Falls back to 0 if the fetch
// failed (graceful : pill still renders, just shows "★ —").
const stars = computed(() => Number(runtimeConfig.public.githubStars) || 0)
const starsLabel = computed(() => {
  const n = stars.value
  if (!n) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
})
</script>

<template>
  <header
    class="sticky top-0 z-50 h-14 px-6 flex items-center justify-between gap-4 surface-overlay backdrop-blur-md backdrop-saturate-150 border-b surface-border"
  >
    <!-- LEFT cluster — brand + version + GitHub stars -->
    <div class="flex items-center gap-3">
      <NuxtLink
        to="/"
        class="header-brand inline-flex items-center gap-2 px-1 py-1 rounded-md transition-default hover:surface-elevated"
        :aria-label="t('header.brand_aria')"
      >
        <PokeballIcon size="md" class="pokeball-spin-target" />
        <span class="header-wordmark hidden sm:inline">
          claude-<span class="header-wordmark-accent">pokemon</span>
        </span>
      </NuxtLink>
      <span
        class="pill font-mono text-[0.6875rem] text-tertiary"
        :title="t('header.version_title', { version })"
      >
        v{{ version }}
      </span>
      <a
        href="https://github.com/Benoit1108/claude-pokemon"
        target="_blank"
        rel="noopener"
        class="pill pill-interactive hidden md:inline-flex"
        :aria-label="t('header.stars_aria', { count: stars })"
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
        <span class="text-accent leading-none">★</span>
        <span>{{ starsLabel }}</span>
      </a>
    </div>

    <!-- CENTRE cluster — nav tabs (desktop only ; BottomNav owns mobile) -->
    <nav class="nav-tabs hidden md:flex items-center gap-0.5" :aria-label="t('header.brand_aria')">
      <NuxtLink
        v-for="tab in tabs"
        :key="tab.to"
        :to="tab.to"
        class="nav-tab"
        :aria-current="isActive(tab) ? 'page' : undefined"
      >
        {{ t(tab.labelKey) }}
      </NuxtLink>
    </nav>

    <!-- RIGHT cluster — theme toggle + lang switch + user pill -->
    <div class="flex items-center gap-2">
      <ColorModeToggle />
      <button
        v-for="l in availableLocales"
        :key="l.code"
        type="button"
        class="pill pill-interactive font-mono text-[0.6875rem] uppercase hidden sm:inline-flex"
        :aria-label="t('header.lang_switch_aria') + ' → ' + l.name"
        :title="l.name"
        @click="switchLocale(l.code)"
      >
        {{ l.code }}
      </button>
      <UserMenu />
    </div>
  </header>
</template>

<style scoped>
.header-brand:hover :deep(.pokeball-spin-target svg) {
  animation: header-pokeball-spin 1.8s linear infinite;
}
@keyframes header-pokeball-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .header-brand:hover :deep(.pokeball-spin-target svg) {
    animation: none;
  }
}

.header-wordmark {
  font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: -0.02em;
  color: var(--text-primary, currentColor);
}
.header-wordmark-accent {
  background: linear-gradient(135deg, #d4a017 0%, #ef6c00 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
:global(html.dark .header-wordmark-accent) {
  background: linear-gradient(135deg, #ffd700 0%, #ef6c00 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* Nav tab base + active underline anchored to header bottom edge */
.nav-tab {
  position: relative;
  padding: 0.5rem 0.875rem;
  border-radius: 10px;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(82 82 91); /* zinc-600 */
  transition:
    color 200ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
:global(html.dark .nav-tab) {
  color: rgb(161 161 170); /* zinc-400 */
}
.nav-tab:hover {
  color: rgb(24 24 27);
  background: rgb(244 244 245 / 0.6);
}
:global(html.dark .nav-tab:hover) {
  color: rgb(244 244 245);
  background: rgb(255 255 255 / 0.04);
}
.nav-tab[aria-current='page'] {
  color: rgb(24 24 27);
  font-weight: 600;
}
:global(html.dark .nav-tab[aria-current='page']) {
  color: rgb(244 244 245);
}
.nav-tab[aria-current='page']::after {
  content: '';
  position: absolute;
  left: 0.875rem;
  right: 0.875rem;
  bottom: -1rem; /* sits flush with the header border-bottom */
  height: 2px;
  background: linear-gradient(90deg, #d4a017 0%, #ef6c00 100%);
  border-radius: 2px 2px 0 0;
}
:global(html.dark .nav-tab[aria-current='page']::after) {
  background: linear-gradient(90deg, #ffd700 0%, #ef6c00 100%);
}
</style>
