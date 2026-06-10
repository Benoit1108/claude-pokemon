<script setup lang="ts">
import type { TrainerResponse } from '~/types/api'

const route = useRoute()
const api = useApi()
const { t } = useI18n()

const anonId = computed(() => route.params.anonId as string)

const { data: trainer, error } = await useAsyncData<TrainerResponse>(
  () => `trainer-${anonId.value}`,
  () => api.trainer(anonId.value),
)

// Set proper HTTP status when trainer not found (SEO + correctness).
if (error.value && import.meta.server) {
  setResponseStatus(404)
}

useHead({
  title: () =>
    trainer.value?.display_name
      ? `${trainer.value.display_name}#${trainer.value.anon_id.slice(0, 4)} · claude-pokemon arena`
      : `${t('trainer.card_label')} ${anonId.value} · claude-pokemon arena`,
  meta: [
    {
      name: 'description',
      content: trainer.value
        ? `${t('trainer.card_label')} — ${trainer.value.display_name || trainer.value.anon_id}`
        : t('trainer.not_found_title'),
    },
  ],
})
</script>

<template>
  <main class="max-w-4xl mx-auto px-6 py-12">
    <div class="mb-6">
      <NuxtLink to="/" class="text-secondary hover:text-primary text-sm transition">
        ← {{ t('trainer.back_leaderboard') }}
      </NuxtLink>
    </div>

    <div v-if="error" class="card p-12 text-center">
      <div class="text-6xl mb-4" aria-hidden="true">🥺</div>
      <h1 class="text-2xl font-bold text-primary mb-2">{{ t('trainer.not_found_title') }}</h1>
      <p class="text-secondary">
        {{ t('trainer.not_found_body') }} <code class="text-accent">{{ anonId }}</code>
      </p>
      <p class="text-muted text-sm mt-4">
        {{ t('trainer.not_found_optout') }} <code>/pokemon stats-share forget</code>.
      </p>
    </div>

    <template v-else-if="trainer">
      <TrainerHero :trainer="trainer" />
      <TrainerStatsCards
        :lifetime="trainer.stats.lifetime"
        :pokedex-seen-count="trainer.stats.pokedex_seen_count"
      />
      <p v-if="trainer.stats.pokedex_seen_ids?.length" class="text-center -mt-8 mb-12 text-sm">
        <NuxtLink :to="`/pokedex?trainer=${anonId}`" class="text-accent hover:underline">
          {{ t('trainer.view_pokedex') }}
        </NuxtLink>
      </p>
      <TrainerPokedexAchievements
        v-if="trainer.stats.pokedex_seen_ids?.length"
        :seen-ids="trainer.stats.pokedex_seen_ids"
      />
      <TrainerBadges :earned="trainer.stats.badges" />

      <footer class="text-center text-muted text-sm mt-12 pt-8 border-t surface-border">
        <p>
          {{ t('trainer.last_submit') }}
          <time :datetime="trainer.submitted_at">{{ trainer.submitted_at.slice(0, 10) }}</time>
          · {{ t('trainer.cli_version') }}
          <code class="text-secondary">{{ trainer.client_version }}</code>
        </p>
        <p class="mt-2 text-xs">
          {{ t('trainer.want_card') }}
          <a
            href="https://www.npmjs.com/package/claude-pokemon"
            class="text-accent hover:underline"
          >
            {{ t('trainer.install_cli') }}
          </a>
        </p>
      </footer>
    </template>
  </main>
</template>
