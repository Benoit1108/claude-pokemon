<script setup lang="ts">
import { BOT_TRAINERS } from '~/data/bot-trainers'
import { useLadderProgress } from '~/composables/useLadderProgress'

const ladder = useLadderProgress()
const { t } = useI18n()

useHead({
  title: t('ladder.page_title_meta'),
  meta: [
    {
      name: 'description',
      content: t('ladder.page_desc'),
    },
  ],
})

function isLocked(idx: number): boolean {
  // A tile is locked if any earlier tile hasn't been beaten yet (linear path).
  for (let i = 0; i < idx; i++) {
    if (!ladder.isBeaten(BOT_TRAINERS[i]!.id)) return true
  }
  return false
}

function confirmReset() {
  if (typeof window === 'undefined') return
  if (window.confirm(t('ladder.reset_confirm'))) {
    ladder.reset()
  }
}
</script>

<template>
  <main class="max-w-5xl mx-auto px-6 py-12">
    <div class="mb-6">
      <NuxtLink to="/" class="text-secondary hover:text-primary text-sm transition">
        {{ t('ladder.back_home') }}
      </NuxtLink>
    </div>

    <header class="text-center mb-10">
      <h1 class="text-4xl md:text-5xl font-bold text-primary mb-3">{{ t('ladder.title_long') }}</h1>
      <p class="text-secondary max-w-2xl mx-auto mb-4">
        {{ t('ladder.intro_pre') }}
        <strong class="text-accent">{{ t('ladder.intro_title') }}</strong>
        {{ t('ladder.intro_post') }}
      </p>
    </header>

    <!-- Progress bar -->
    <div class="card p-4 mb-6">
      <div class="flex items-center justify-between text-sm text-secondary mb-2">
        <span class="font-mono">
          {{ t('ladder.progress', { beaten: ladder.beatenCount.value, total: ladder.totalCount }) }}
        </span>
        <span v-if="ladder.isComplete.value" class="text-accent font-bold">
          {{ t('ladder.trail_conqueror') }}
        </span>
        <span v-else-if="ladder.beatenCount.value > 0">
          <button
            type="button"
            class="text-xs text-muted hover:text-secondary underline"
            @click="confirmReset"
          >
            {{ t('ladder.reset_progress') }}
          </button>
        </span>
      </div>
      <div class="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
        <div
          class="h-full bg-accent transition-all duration-500 ease-out"
          :style="{ width: `${ladder.progress.value * 100}%` }"
        />
      </div>
    </div>

    <!-- Tiles grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      <BotTrainerTile
        v-for="(bot, i) in BOT_TRAINERS"
        :key="bot.id"
        :bot="bot"
        :index="i"
        :is-beaten="ladder.isBeaten(bot.id)"
        :is-locked="isLocked(i)"
        :is-next="i === ladder.nextIndex.value"
      />
    </div>

    <footer class="text-center text-muted text-sm mt-12 pt-8 border-t surface-border">
      <p>
        {{ t('ladder.footer_offline') }}
      </p>
    </footer>
  </main>
</template>
