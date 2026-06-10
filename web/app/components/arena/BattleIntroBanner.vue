<script setup lang="ts">
// Pokémon BW-style intro banner — dark bottom-of-screen ribbon that announces
// "Un combat est lancé par <Dresseur> !" then auto-dismisses after a beat.
// Sprint 2.13 UA1.

const props = defineProps<{
  challengerName: string
  /** ms before auto-dismiss. Set 0 to keep visible until parent unmounts it. */
  durationMs?: number
}>()

const emit = defineEmits<{ done: [] }>()

const visible = ref(true)

onMounted(() => {
  const ms = props.durationMs ?? 2400
  if (ms === 0) return
  setTimeout(() => {
    visible.value = false
    setTimeout(() => emit('done'), 400) // wait for fade-out before letting parent unmount
  }, ms)
})
</script>

<template>
  <Transition name="banner-fade">
    <div
      v-if="visible"
      class="absolute inset-x-0 bottom-0 z-20 pointer-events-none flex items-end justify-center pb-4"
      role="status"
      aria-live="polite"
    >
      <div
        class="px-4 py-3 rounded-md shadow-2xl bg-black/85 backdrop-blur-sm border-l-4 border-accent text-white max-w-xs w-full text-sm"
      >
        <i18n-t keypath="battle_stage.intro_banner" tag="span">
          <template #name>
            <span class="font-bold text-accent">{{ challengerName }}</span>
          </template>
        </i18n-t>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.banner-fade-enter-active,
.banner-fade-leave-active {
  transition:
    opacity 350ms ease,
    transform 350ms ease;
}
.banner-fade-enter-from,
.banner-fade-leave-to {
  opacity: 0;
  transform: translateY(20px);
}
@media (prefers-reduced-motion: reduce) {
  .banner-fade-enter-active,
  .banner-fade-leave-active {
    transition: none;
  }
}
</style>
