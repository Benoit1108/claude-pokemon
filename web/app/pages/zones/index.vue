<script setup lang="ts">
// /zones — wild zones grid. Sprint 5 design pass : status badges system
// (sweet / preview / outclassed / locked) with distinct visual treatment
// instead of one generic "trop bas" message. Each tile picks a lineage-
// soft radial gradient from its primary combat_type.
//
// Mockup reference : docs/mockups/sprint-5/04-zones.html.

import type { ZoneSummary } from '~/types/api'

const api = useApi()
const { trainer } = useTrainerProfile()
const { t } = useI18n()

const {
  data: zonesData,
  error: zonesError,
  pending: zonesPending,
} = await useAsyncData('zones-list', () => api.zonesList())

const zones = computed(() => zonesData.value?.zones ?? [])
const trainerLevel = computed(() => trainer.value?.stats.active.current_level ?? 0)

const errorMessage = computed(() => {
  if (!zonesError.value) return null
  const e = zonesError.value as { message?: string; statusCode?: number }
  return e.message || t('zones.load_error_http', { status: e.statusCode ?? '??' })
})

type ZoneState = 'locked' | 'sweet' | 'outclassed' | 'preview'

interface ZoneStatus {
  state: ZoneState
  label: string
  short: string
}

function statusFor(z: ZoneSummary): ZoneStatus {
  if (!trainer.value) {
    return {
      state: 'preview',
      label: t('zones.preview_locked_label'),
      short: t('zones.status_preview'),
    }
  }
  if (trainerLevel.value < z.level_min - 10) {
    return {
      state: 'locked',
      label: t('zones.locked_min_label', { level: Math.max(1, z.level_min - 10) }),
      short: t('zones.status_locked'),
    }
  }
  if (trainerLevel.value > z.level_max + 10) {
    return {
      state: 'outclassed',
      label: t('zones.outclassed_label'),
      short: t('zones.status_xp_reduced'),
    }
  }
  return { state: 'sweet', label: t('zones.sweet_label'), short: t('zones.status_sweet') }
}

// Map a zone's emoji to a lineage type for the bg gradient. The wild_pool
// has its own combat_type but a single radial color is enough for the
// visual ; we pick the most representative one from the zone's name/emoji.
function zoneColor(z: ZoneSummary): string {
  const emoji = z.emoji || ''
  if (emoji.includes('🔥') || emoji.includes('🌋')) return '#ef6c00'
  if (emoji.includes('🌊') || emoji.includes('🏝')) return '#268fff'
  if (emoji.includes('🌳') || emoji.includes('🌲') || emoji.includes('🍃')) return '#64b437'
  if (emoji.includes('⛰') || emoji.includes('🏔')) return '#d4a017'
  return '#268fff' // fallback water
}

useHead({
  title: t('zones.title_meta'),
  meta: [
    {
      name: 'description',
      content: t('zones.meta_description'),
    },
  ],
})
</script>

<template>
  <main class="max-w-6xl mx-auto px-6 pt-12 pb-16">
    <!-- Page head : left-aligned title + paired-trainer level pill on the right -->
    <header class="flex items-end justify-between gap-6 flex-wrap mb-10 reveal reveal-1">
      <div>
        <h1 class="text-h1">{{ t('zones.title') }}</h1>
        <p class="text-body max-w-xl mt-2">
          {{ t('zones.subtitle') }}
        </p>
      </div>
      <div v-if="trainer" class="pill">
        <span class="text-caption">{{ t('zones.you_label') }}</span>
        <span class="font-display font-bold text-primary text-base leading-none">
          Lv.<span class="text-accent">{{ trainerLevel }}</span>
        </span>
      </div>
    </header>

    <!-- Loading / error / empty states -->
    <div v-if="zonesPending" class="card p-12 text-center">
      <div class="text-3xl mb-2 animate-pulse" aria-hidden="true">🗺️</div>
      <p class="text-secondary">{{ t('zones.loading') }}</p>
    </div>

    <div
      v-else-if="errorMessage"
      class="card p-8 text-center"
      style="border-color: rgb(220 38 38 / 0.4)"
    >
      <div class="text-3xl mb-2" aria-hidden="true">⚠️</div>
      <p class="text-danger font-bold">{{ t('zones.load_error_title') }}</p>
      <p class="text-xs text-secondary mt-2">{{ errorMessage }}</p>
      <p class="text-caption mt-4 max-w-md mx-auto">
        {{ t('zones.load_error_hint_pre') }}<code>{{ t('zones.load_error_hint_dev') }}</code>
        {{ t('zones.load_error_hint_mid') }}
        <code>{{ t('zones.load_error_hint_pkg') }}</code>
        {{ t('zones.load_error_hint_url') }}
        <code>{{ String(useRuntimeConfig().public.apiBase) }}/v1/zones</code>
        {{ t('zones.load_error_hint_responds') }}
      </p>
    </div>

    <div v-else-if="zones.length === 0" class="card p-8 text-center">
      <div class="text-3xl mb-2" aria-hidden="true">🌵</div>
      <p class="text-secondary">{{ t('zones.empty_title') }}</p>
    </div>

    <div v-else class="zones-grid">
      <NuxtLink
        v-for="(z, i) in zones"
        :key="z.id"
        :to="`/zones/${z.id}`"
        class="zone reveal"
        :class="[`reveal-${(i % 5) + 1}`, `zone--${statusFor(z).state}`]"
        :style="{ '--zone-color': zoneColor(z) }"
      >
        <div class="zone-bg" aria-hidden="true" />
        <div class="zone-content">
          <div class="zone-head">
            <span class="zone-icon" aria-hidden="true">{{ z.emoji }}</span>
            <span class="status-badge" :class="`status-badge--${statusFor(z).state}`">
              {{ statusFor(z).short }}
            </span>
          </div>

          <h2 class="zone-title">{{ z.name_fr }}</h2>
          <p class="zone-desc">{{ z.flavor_fr }}</p>

          <div class="zone-meta">
            <span class="zone-meta-level"> Lv.{{ z.level_min }}–{{ z.level_max }} </span>
            <span class="zone-meta-div" />
            <span class="zone-pool" :class="z.rare_pool_size > 0 ? 'has-rare' : ''">
              <span class="dot" />
              {{ t('zones.pool_commons', { count: z.wild_pool_size }) }}
              <template v-if="z.rare_pool_size > 0">{{
                t('zones.pool_rares', { count: z.rare_pool_size })
              }}</template>
              <template v-if="z.legendary_pool_size > 0">{{
                t('zones.pool_legendary', { count: z.legendary_pool_size })
              }}</template>
            </span>
          </div>

          <span class="zone-cta">
            {{ t('zones.explore') }}
            <svg
              width="13"
              height="13"
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
        </div>

        <!-- Lock icon overlay (top-right corner) for locked zones only. -->
        <span v-if="statusFor(z).state === 'locked'" class="zone-lock" aria-hidden="true">
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
      </NuxtLink>
    </div>

    <!-- Legend / footnote -->
    <div class="legend mt-10 reveal reveal-5">
      <span class="text-caption">{{ t('zones.legend_title') }}</span>
      <div class="legend-row">
        <span class="status-badge status-badge--sweet">{{ t('zones.status_sweet') }}</span>
        {{ t('zones.legend_sweet') }}
      </div>
      <div class="legend-row">
        <span class="status-badge status-badge--outclassed">{{
          t('zones.status_xp_reduced')
        }}</span>
        {{ t('zones.legend_outclassed') }}
      </div>
      <div class="legend-row">
        <span class="status-badge status-badge--locked">{{ t('zones.status_locked') }}</span>
        {{ t('zones.legend_locked') }}
      </div>
      <div class="legend-row">
        <span class="status-badge status-badge--preview">{{ t('zones.status_preview') }}</span>
        {{ t('zones.legend_preview') }}
      </div>
    </div>
  </main>
</template>

<style scoped>
.zones-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1rem;
}
@media (max-width: 980px) {
  .zones-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .zones-grid {
    grid-template-columns: 1fr;
  }
}

.zone {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 1.25rem 1.25rem 1.125rem;
  background: #fff;
  border: 1px solid rgb(228 228 231);
  border-radius: 14px;
  overflow: hidden;
  color: inherit;
  text-decoration: none;
  min-height: 200px;
  transition:
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
:global(html.dark .zone) {
  background: #161b22;
  border-color: rgb(48 54 61);
}

.zone-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(120% 90% at 100% 0%, var(--zone-color) 0%, transparent 55%),
    radial-gradient(80% 70% at 0% 100%, var(--zone-color) 0%, transparent 50%);
  opacity: 0.08;
  transition: opacity 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
:global(html.dark .zone-bg) {
  opacity: 0.11;
}

.zone-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.zone:hover {
  transform: translateY(-3px);
  border-color: var(--zone-color);
  box-shadow: 0 14px 32px -10px color-mix(in srgb, var(--zone-color) 35%, transparent);
}
.zone:hover .zone-bg {
  opacity: 0.2;
}
:global(html.dark .zone:hover .zone-bg) {
  opacity: 0.24;
}
.zone:hover .zone-cta {
  opacity: 1;
  transform: translateX(0);
}

/* Locked state — flat, no hover lift, dim content. */
.zone--locked {
  cursor: not-allowed;
}
.zone--locked .zone-bg {
  opacity: 0.04;
}
.zone--locked .zone-title,
.zone--locked .zone-desc {
  filter: grayscale(0.5);
  color: rgb(161 161 170);
}
.zone--locked .zone-icon {
  filter: grayscale(0.7);
  opacity: 0.55;
}
.zone--locked:hover {
  transform: none;
  border-color: rgb(228 228 231);
  box-shadow: none;
}
:global(html.dark .zone--locked:hover) {
  border-color: rgb(48 54 61);
}
.zone--locked:hover .zone-bg {
  opacity: 0.04;
}
.zone--locked:hover .zone-cta {
  opacity: 0.5;
  transform: translateX(0);
}
.zone--locked .zone-cta {
  color: rgb(113 113 122);
}

.zone-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.zone-icon {
  font-size: 1.75rem;
  line-height: 1;
  filter: drop-shadow(0 6px 12px rgb(0 0 0 / 0.2));
}

.zone-title {
  margin: 0.5rem 0 0;
  font-family: 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  font-size: 1.0625rem;
  letter-spacing: -0.01em;
  color: rgb(24 24 27);
}
:global(html.dark .zone-title) {
  color: rgb(240 246 252);
}

.zone-desc {
  margin: 0.125rem 0 0;
  font-size: 0.8125rem;
  color: rgb(82 82 91);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
:global(html.dark .zone-desc) {
  color: rgb(139 148 158);
}

.zone-meta {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-top: auto;
  padding-top: 0.875rem;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.6875rem;
  color: rgb(113 113 122);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  flex-wrap: wrap;
}
.zone-meta-div {
  width: 1px;
  height: 10px;
  background: rgb(228 228 231);
}
:global(html.dark .zone-meta-div) {
  background: rgb(48 54 61);
}
.zone-pool {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}
.zone-pool .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(113 113 122);
}
.zone-pool.has-rare .dot {
  background: var(--zone-color);
}

.zone-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 0.75rem;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--zone-color);
  opacity: 0;
  transform: translateX(-4px);
  transition:
    opacity 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.zone-lock {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 2;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgb(244 244 245);
  border: 1px solid rgb(228 228 231);
  border-radius: 50%;
  color: rgb(82 82 91);
}
:global(html.dark .zone-lock) {
  background: rgb(28 33 40);
  border-color: rgb(48 54 61);
  color: rgb(161 161 170);
}

/* Status badges — 4 distinct variants with colored dot prefix. */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.status-badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px currentColor;
  opacity: 0.25;
}
.status-badge--sweet {
  background: rgb(22 163 74 / 0.12);
  color: rgb(22 163 74);
}
:global(html.dark .status-badge--sweet) {
  background: rgb(34 197 94 / 0.14);
  color: rgb(34 197 94);
}
.status-badge--preview {
  background: rgb(37 99 235 / 0.12);
  color: rgb(37 99 235);
}
:global(html.dark .status-badge--preview) {
  background: rgb(59 130 246 / 0.14);
  color: rgb(59 130 246);
}
.status-badge--outclassed {
  background: rgb(217 119 6 / 0.12);
  color: rgb(217 119 6);
}
:global(html.dark .status-badge--outclassed) {
  background: rgb(245 158 11 / 0.14);
  color: rgb(245 158 11);
}
.status-badge--locked {
  background: rgb(244 244 245);
  color: rgb(113 113 122);
}
:global(html.dark .status-badge--locked) {
  background: rgb(33 38 45);
  color: rgb(139 148 158);
}

/* Legend */
.legend {
  padding: 1.125rem 1.25rem;
  background: var(--surface-card, #fff);
  border: 1px solid rgb(228 228 231);
  border-radius: 14px;
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 0.625rem 1rem;
  align-items: center;
}
:global(html.dark .legend) {
  background: #161b22;
  border-color: rgb(48 54 61);
}
.legend > .text-caption {
  grid-column: 1 / -1;
  margin-bottom: 0.25rem;
}
.legend-row {
  display: contents;
}
.legend-row > .status-badge {
  grid-column: 1;
}
.legend-row {
  font-size: 0.8125rem;
  color: rgb(82 82 91);
}
:global(html.dark .legend-row) {
  color: rgb(139 148 158);
}
@media (max-width: 560px) {
  .legend {
    grid-template-columns: 1fr;
  }
  .legend-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
}
</style>
