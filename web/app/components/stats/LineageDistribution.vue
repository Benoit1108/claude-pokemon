<script setup lang="ts">
import { lineageEmoji } from '~/utils/lineage'

defineProps<{
  distribution: Record<string, number> | undefined
}>()

const { t } = useI18n()
</script>

<template>
  <section v-if="distribution && Object.keys(distribution).length" class="mb-12">
    <h2 class="text-sm uppercase tracking-wider text-muted mb-3">{{ t('lineage_dist.title') }}</h2>
    <div class="card p-4 flex flex-wrap gap-3">
      <div
        v-for="(count, lineage) in distribution"
        :key="lineage"
        class="px-3 py-2 surface-card-hover surface-border border rounded-md text-sm"
      >
        {{ lineageEmoji(lineage) }} <span class="text-primary">{{ lineage }}</span>
        <span class="ml-2 text-muted tabular-nums">{{ count }}</span>
      </div>
    </div>
  </section>
</template>
