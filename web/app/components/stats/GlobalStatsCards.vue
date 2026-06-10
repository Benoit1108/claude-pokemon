<script setup lang="ts">
import { fmt, fmtPct } from '~/utils/format'
import type { AggregateResponse } from '~/types/api'

defineProps<{
  aggregate: AggregateResponse | null | undefined
}>()

const { t } = useI18n()
</script>

<template>
  <section class="mb-12">
    <h2 class="text-sm uppercase tracking-wider text-muted mb-3">{{ t('stats_cards.title') }}</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div class="card p-4">
        <div class="text-xs text-muted uppercase">{{ t('stats_cards.players') }}</div>
        <div class="text-3xl font-bold text-accent mt-1">
          {{ aggregate?.total_players ?? '—' }}
        </div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-muted uppercase">{{ t('stats_cards.tokens_combined') }}</div>
        <div class="text-3xl font-bold mt-1 text-primary">
          {{ fmt(aggregate?.total_tokens_combined) }}
        </div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-muted uppercase">{{ t('stats_cards.shinies_observed') }}</div>
        <div class="text-3xl font-bold mt-1 text-primary">
          ⭐ {{ aggregate?.total_shinies_observed ?? '—' }}
        </div>
      </div>
      <div class="card p-4">
        <div class="text-xs text-muted uppercase">{{ t('stats_cards.shiny_rate') }}</div>
        <div class="text-3xl font-bold mt-1 text-primary">
          {{ fmtPct(aggregate?.shiny_rate_observed) }}
        </div>
      </div>
    </div>
  </section>
</template>
