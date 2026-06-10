<script setup lang="ts">
import { typeColor } from '~/utils/pokedex'
import type { WildPokemon } from '~/types/pokedex'

const props = defineProps<{
  pokemon: WildPokemon
  lang?: 'fr' | 'en'
  /** Sprint 2.11 — when a trainer view is active, undefined = no overlay,
   * true = "seen by this trainer", false = "not yet encountered" (greyed out). */
  seenByTrainer?: boolean | undefined
}>()

const { t } = useI18n()

const displayName = computed(() =>
  props.lang === 'en' ? props.pokemon.name_en : props.pokemon.name_fr,
)

const rarityRing = computed(() => {
  if (props.pokemon.rarity === 'legendary') return 'ring-2 ring-accent'
  if (props.pokemon.rarity === 'rare') return 'ring-1 ring-purple-400 dark:ring-purple-500'
  return ''
})

// Pokédex IDs map 1:1 to Showdown showdown_id, so we can hot-link directly.
const spriteUrl = computed(
  () => `https://play.pokemonshowdown.com/sprites/gen5/${props.pokemon.id}.png`,
)
const spriteFailed = ref(false)
</script>

<template>
  <NuxtLink
    :to="`/pokedex/${pokemon.id}`"
    class="card p-3 transition surface-card-hover relative block hover:scale-[1.03]"
    :class="[rarityRing, seenByTrainer === false ? 'opacity-30 grayscale' : '']"
    :title="`${pokemon.name_en} · ${pokemon.type} · ${pokemon.rarity}`"
  >
    <span
      v-if="seenByTrainer === true"
      class="absolute top-1 left-1 text-xs"
      :title="t('pokedex_card.seen_by_trainer')"
      >✓</span
    >
    <div class="text-xs text-muted text-right tabular-nums">
      #{{ pokemon.national_dex.toString().padStart(3, '0') }}
    </div>
    <div class="flex items-center justify-center my-1 h-16">
      <img
        v-if="!spriteFailed"
        :src="spriteUrl"
        :alt="pokemon.name_en"
        loading="lazy"
        decoding="async"
        class="w-16 h-16 object-contain pixel-render sprite-yoyo-pokedex"
        @error="spriteFailed = true"
      />
      <span v-else class="text-4xl" aria-hidden="true">{{ pokemon.emoji }}</span>
    </div>
    <div class="text-center font-semibold text-primary text-sm truncate">
      {{ displayName }}
    </div>
    <div class="text-center text-xs mt-1" :class="typeColor(pokemon.type)">
      {{ pokemon.type }}
    </div>
    <div v-if="pokemon.rarity !== 'common'" class="text-center mt-1">
      <span
        class="text-xs uppercase tracking-wider"
        :class="
          pokemon.rarity === 'legendary' ? 'text-accent' : 'text-purple-400 dark:text-purple-300'
        "
      >
        {{
          pokemon.rarity === 'legendary'
            ? t('pokedex_card.rarity_legendary')
            : t('pokedex_card.rarity_rare')
        }}
      </span>
    </div>
  </NuxtLink>
</template>

<style scoped>
@keyframes pokedex-yoyo {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-2px);
  }
}
.sprite-yoyo-pokedex {
  animation: pokedex-yoyo 3s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .sprite-yoyo-pokedex {
    animation: none;
  }
}
</style>
