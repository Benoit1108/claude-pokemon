<script setup lang="ts">
// Sprint 5 — landing page. Hero (short) + 4 featured section tiles (2×2 on
// desktop, stacked on mobile) + secondary CTAs (signup, install CLI,
// GitHub) declassed + global stats + leaderboard stub. The 4 tiles ARE
// the primary discovery surface — they sell the gameplay sections that
// also live in AppHeader's nav.
//
// Mockup reference : docs/mockups/sprint-5/02-landing.html.

const api = useApi()
const runtimeConfig = useRuntimeConfig()
const { t } = useI18n()

const { data: aggregate } = await useAsyncData('aggregate', () => api.aggregate())
const { data: leaderboard } = await useAsyncData('leaderboard', () =>
  api.leaderboard('total_tokens', 10),
)

const version = computed(() => runtimeConfig.public.version || '0.1')

// Sprint 2.12 — Konami code easter egg.
const KONAMI_SEQUENCE = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'KeyB',
  'KeyA',
]
const konamiBuffer: string[] = []
const konamiTriggered = ref(false)

async function fireKonami(): Promise<void> {
  konamiTriggered.value = true
  const { default: confetti } = await import('canvas-confetti')
  for (const origin of [
    { x: 0.2, y: 0.3 },
    { x: 0.8, y: 0.3 },
    { x: 0.5, y: 0.9 },
  ]) {
    confetti({
      particleCount: 100,
      spread: 80,
      origin,
      colors: ['#fbbf24', '#ef6c00', '#3d8de8', '#7eb858'],
    })
  }
  setTimeout(() => {
    konamiTriggered.value = false
  }, 3000)
}

function onKeydown(event: KeyboardEvent): void {
  const expected = KONAMI_SEQUENCE[konamiBuffer.length]
  if (event.code === expected) {
    konamiBuffer.push(event.code)
    if (konamiBuffer.length === KONAMI_SEQUENCE.length) {
      konamiBuffer.length = 0
      void fireKonami()
    }
  } else if (konamiBuffer.length > 0) {
    konamiBuffer.length = 0
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

// Featured section tiles. Lineage mapping (user validated) :
//   Pokédex → water (encyclopédique, profond)
//   Arena   → fire  (combat)
//   Trail   → grass (parcours / biomes)
//   Zones   → electric (wild dynamique)
// Tile content stays computed from t() so toggling the locale re-renders
// titles/descriptions/badges live. Keys mirror i18n/locales/{fr,en}.json
// home.tile_{pokedex|arena|trail|zones}_{title|desc|badge}.
interface FeaturedTile {
  to: string
  icon: 'pokedex' | 'arena' | 'trail' | 'zones'
  i18nKey: 'pokedex' | 'arena' | 'trail' | 'zones'
  lineage: 'water' | 'fire' | 'grass' | 'electric'
}
const tiles: FeaturedTile[] = [
  { to: '/pokedex', icon: 'pokedex', i18nKey: 'pokedex', lineage: 'water' },
  { to: '/arena', icon: 'arena', i18nKey: 'arena', lineage: 'fire' },
  { to: '/ladder', icon: 'trail', i18nKey: 'trail', lineage: 'grass' },
  { to: '/zones', icon: 'zones', i18nKey: 'zones', lineage: 'electric' },
]

const lineageColor: Record<FeaturedTile['lineage'], string> = {
  fire: '#ef6c00',
  water: '#268fff',
  grass: '#64b437',
  electric: '#ffda00',
}
</script>

<template>
  <main class="max-w-6xl mx-auto px-6">
    <!-- Hero. `z-0` crée un stacking context pour piéger `.hero-deco`
         (z-index:-1) à l'intérieur ; sans ça il s'évade derrière l'ancêtre
         `surface-bg` opaque et les pokéballs décoratives disparaissent. -->
    <section class="relative z-0 pt-20 pb-8 text-center overflow-hidden">
      <!-- Decorative outlined pokéballs in bg, very low opacity -->
      <div class="hero-deco" aria-hidden="true">
        <svg class="p1" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M2 16 A14 14 0 0 1 30 16" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="16" cy="16" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
        <svg class="p2" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path d="M2 16 A14 14 0 0 1 30 16" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="16" cy="16" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" />
        </svg>
      </div>

      <div class="max-w-3xl mx-auto">
        <span class="hero-eyebrow reveal reveal-1">{{ t('home.eyebrow', { version }) }}</span>
        <h1
          class="text-display mt-6 transition-transform"
          :class="konamiTriggered ? 'scale-105' : ''"
        >
          claude-<span class="hero-accent">pokemon</span> arena
        </h1>
        <p class="hero-subtitle reveal reveal-2">
          {{ t('home.subtitle_part1') }}
          <code class="font-mono px-1.5 py-0.5 surface-elevated rounded-sm text-sm"
            >npx claude-pokemon</code
          >.
        </p>
        <span v-if="konamiTriggered" class="inline-block mt-4 text-2xl" aria-hidden="true">✨</span>
      </div>
    </section>

    <!-- 4 featured tiles — primary discovery surface -->
    <section
      class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6"
      :aria-label="t('home.sections_aria')"
    >
      <NuxtLink
        v-for="(tile, i) in tiles"
        :key="tile.to"
        :to="tile.to"
        class="tile reveal"
        :class="`reveal-${i + 1}`"
        :style="{ '--tile-color': lineageColor[tile.lineage] }"
      >
        <div class="tile-head">
          <span class="tile-icon">
            <SectionIcon :name="tile.icon" :size="44" :stroke="1.8" />
          </span>
          <span class="tile-badge">{{ t(`home.tile_${tile.i18nKey}_badge`) }}</span>
        </div>
        <h2 class="text-h2 mt-1">{{ t(`home.tile_${tile.i18nKey}_title`) }}</h2>
        <p class="tile-desc">{{ t(`home.tile_${tile.i18nKey}_desc`) }}</p>
        <span class="tile-cta">
          {{ t('home.tile_enter') }}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </span>
      </NuxtLink>
    </section>

    <!-- Secondary CTAs (déclassés vs Phase 4.2 où ils étaient en hero) -->
    <div class="flex justify-center gap-2.5 flex-wrap mt-8 reveal reveal-5">
      <NuxtLink to="/signup" class="btn-secondary">
        <span aria-hidden="true">🎮</span> {{ t('home.cta_signup') }}
      </NuxtLink>
      <a href="https://www.npmjs.com/package/claude-pokemon" class="btn-ghost">
        <span aria-hidden="true">💻</span> {{ t('home.cta_install') }}
      </a>
      <a
        href="https://github.com/Benoit1108/claude-pokemon"
        target="_blank"
        rel="noopener"
        class="btn-ghost"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path
            d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
          />
        </svg>
        {{ t('home.cta_github') }}
      </a>
    </div>

    <!-- Below-the-fold strips : reuse existing data components -->
    <section class="mt-16">
      <GlobalStatsCards :aggregate="aggregate" />
    </section>

    <section class="mt-12">
      <LeaderboardTable :entries="leaderboard?.top ?? []" />
    </section>

    <section class="mt-12">
      <LineageDistribution :distribution="aggregate?.active_lineage_distribution" />
    </section>

    <footer class="text-center text-muted text-sm mt-16 mb-12 pt-8 border-t surface-border">
      <p>
        {{ t('home.footer_roadmap_pre') }}
        <a
          href="https://github.com/Benoit1108/claude-pokemon/blob/main/ROADMAP.md"
          class="text-accent hover:underline"
        >
          {{ t('home.footer_roadmap_link') }}
        </a>
      </p>
      <p class="mt-2 text-xs">{{ t('home.footer_privacy') }}</p>
    </footer>
  </main>
</template>

<style scoped>
/* Hero eyebrow — small uppercase pill with brand-accent dot. */
.hero-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.75rem;
  background: rgb(212 160 23 / 0.1);
  color: rgb(184 134 11);
  border: 1px solid rgb(212 160 23 / 0.3);
  border-radius: 9999px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hero-eyebrow::before {
  content: '';
  width: 6px;
  height: 6px;
  background: #d4a017;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgb(212 160 23 / 0.1);
}
:global(html.dark .hero-eyebrow) {
  background: rgb(255 215 0 / 0.1);
  color: rgb(255 215 0);
  border-color: rgb(255 215 0 / 0.3);
}
:global(html.dark .hero-eyebrow::before) {
  background: #ffd700;
  box-shadow: 0 0 0 4px rgb(255 215 0 / 0.1);
}

.hero-accent {
  background: linear-gradient(135deg, #d4a017 0%, #ef6c00 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
:global(html.dark .hero-accent) {
  background: linear-gradient(135deg, #ffd700 0%, #ef6c00 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.hero-subtitle {
  max-width: 52ch;
  margin: 1.25rem auto 0;
  font-size: 1.0625rem;
  color: rgb(82 82 91);
  line-height: 1.55;
}
:global(html.dark .hero-subtitle) {
  color: rgb(139 148 158);
}

/* Decorative pokéballs in hero bg */
.hero-deco {
  pointer-events: none;
  position: absolute;
  inset: 0;
  overflow: hidden;
  z-index: -1;
  color: rgb(24 24 27);
}
:global(html.dark .hero-deco) {
  color: rgb(240 246 252);
}
.hero-deco svg {
  position: absolute;
  opacity: 0.06;
}
:global(html.dark .hero-deco svg) {
  opacity: 0.08;
}
.hero-deco .p1 {
  top: -40px;
  left: -60px;
  width: 220px;
  transform: rotate(-12deg);
}
.hero-deco .p2 {
  bottom: -80px;
  right: -60px;
  width: 280px;
  transform: rotate(20deg);
}

/* Featured tile ------------------------------------------------------------ */
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 1.75rem 1.75rem 1.5rem;
  min-height: 200px;
  background: var(--surface-card-bg, #fff);
  border: 1px solid rgb(228 228 231);
  border-radius: 20px;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  transition:
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
:global(html.dark .tile) {
  background: #161b22;
  border-color: rgb(48 54 61);
}
.tile::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 120px;
  background: radial-gradient(120% 100% at 0% 0%, var(--tile-color) 0%, transparent 60%);
  opacity: 0.08;
  pointer-events: none;
  transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.tile::after {
  content: '';
  position: absolute;
  left: 0;
  top: 2rem;
  bottom: 2rem;
  width: 3px;
  background: var(--tile-color);
  border-radius: 0 3px 3px 0;
  opacity: 0.7;
  transition:
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    top 200ms cubic-bezier(0.16, 1, 0.3, 1),
    bottom 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.tile:hover {
  transform: translateY(-4px);
  border-color: var(--tile-color);
  box-shadow: 0 18px 40px -12px color-mix(in srgb, var(--tile-color) 40%, transparent);
}
.tile:hover::before {
  opacity: 0.18;
}
:global(html.dark .tile:hover::before) {
  opacity: 0.22;
}
.tile:hover::after {
  top: 1rem;
  bottom: 1rem;
  opacity: 1;
}
.tile:hover .tile-cta {
  opacity: 1;
  transform: translateX(0);
}
.tile:hover .tile-icon {
  transform: translateY(-2px) rotate(-3deg);
}

.tile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.25rem;
}
.tile-icon {
  display: inline-flex;
  color: var(--tile-color);
  filter: drop-shadow(0 6px 12px rgb(0 0 0 / 0.15));
  transition: transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tile-badge {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.6875rem;
  padding: 0.25rem 0.5rem;
  background: color-mix(in srgb, var(--tile-color) 14%, transparent);
  color: var(--tile-color);
  border-radius: 9999px;
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.tile-desc {
  margin: 0;
  font-size: 0.9375rem;
  color: rgb(82 82 91);
  line-height: 1.55;
}
:global(html.dark .tile-desc) {
  color: rgb(139 148 158);
}
.tile-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--tile-color);
  opacity: 0;
  transform: translateX(-6px);
  transition:
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.tile-cta svg {
  transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.tile:hover .tile-cta svg {
  transform: translateX(2px);
}

@media (prefers-reduced-motion: reduce) {
  .tile,
  .tile::after,
  .tile::before,
  .tile-cta,
  .tile-icon {
    transition: none;
  }
}
</style>
