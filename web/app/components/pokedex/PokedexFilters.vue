<script setup lang="ts">
import { uniqueTypes, WILD_POKEMON } from '~/utils/pokedex'
import type { Rarity } from '~/types/pokedex'

const filters = defineModel<{
  gen: 1 | 2 | 'all'
  type: string
  rarity: Rarity | 'all'
  query: string
  lang: 'fr' | 'en'
}>({ required: true })

const { t } = useI18n()
const types = ['all', ...uniqueTypes(WILD_POKEMON)]

function reset() {
  filters.value = { gen: 'all', type: 'all', rarity: 'all', query: '', lang: filters.value.lang }
}
</script>

<template>
  <div class="card p-4 mb-6">
    <div class="flex flex-wrap gap-3 items-center">
      <input
        v-model="filters.query"
        type="search"
        :placeholder="t('pokedex_filters.search_placeholder')"
        class="px-3 py-2 surface-card-hover border surface-border rounded-md text-sm flex-grow min-w-[200px] outline-none focus:ring-2 focus:ring-accent text-primary"
      />

      <select
        v-model="filters.gen"
        class="px-3 py-2 surface-card-hover border surface-border rounded-md text-sm text-primary cursor-pointer"
      >
        <option value="all">{{ t('pokedex_filters.all_gens') }}</option>
        <option :value="1">{{ t('pokedex_filters.gen1') }}</option>
        <option :value="2">{{ t('pokedex_filters.gen2') }}</option>
      </select>

      <select
        v-model="filters.type"
        class="px-3 py-2 surface-card-hover border surface-border rounded-md text-sm text-primary cursor-pointer"
      >
        <option v-for="ty in types" :key="ty" :value="ty">
          {{ ty === 'all' ? t('pokedex_filters.all_types') : ty }}
        </option>
      </select>

      <select
        v-model="filters.rarity"
        class="px-3 py-2 surface-card-hover border surface-border rounded-md text-sm text-primary cursor-pointer"
      >
        <option value="all">{{ t('pokedex_filters.all_rarities') }}</option>
        <option value="common">{{ t('pokedex_filters.rarity_common') }}</option>
        <option value="rare">{{ t('pokedex_filters.rarity_rare') }}</option>
        <option value="legendary">{{ t('pokedex_filters.rarity_legendary') }}</option>
      </select>

      <select
        v-model="filters.lang"
        class="px-3 py-2 surface-card-hover border surface-border rounded-md text-sm text-primary cursor-pointer"
        :title="t('pokedex_filters.lang_title')"
      >
        <option value="fr">{{ t('pokedex_filters.lang_fr') }}</option>
        <option value="en">{{ t('pokedex_filters.lang_en') }}</option>
      </select>

      <button
        type="button"
        class="px-3 py-2 text-sm text-secondary hover:text-primary transition"
        @click="reset"
      >
        {{ t('pokedex_filters.reset') }}
      </button>
    </div>
  </div>
</template>
