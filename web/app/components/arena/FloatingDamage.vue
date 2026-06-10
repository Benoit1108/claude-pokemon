<script setup lang="ts">
// Floating damage number. Renders absolutely positioned within a battle
// scene container, floats upward and fades out over ~1.4s. Color reflects
// the hit's severity : crit = yellow accent, super-effective = red,
// not-very-effective = muted, normal = primary.

defineProps<{
  damage: number
  effectiveness: number
  critical: boolean
}>()

const { t } = useI18n()
</script>

<template>
  <div
    class="floating-damage select-none pointer-events-none font-bold tabular-nums"
    :class="{
      'text-2xl text-yellow-400 drop-shadow-glow': critical,
      'text-xl text-red-400': !critical && effectiveness >= 2,
      'text-lg text-zinc-400': !critical && effectiveness <= 0.5,
      'text-xl text-primary': !critical && effectiveness === 1,
    }"
  >
    <span v-if="critical" class="block text-xs uppercase tracking-widest text-yellow-300 mb-0.5">
      {{ t('floating_damage.crit') }}
    </span>
    −{{ damage }}
  </div>
</template>

<style scoped>
@keyframes float-up {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0.7);
  }
  20% {
    opacity: 1;
    transform: translateY(-12px) scale(1.1);
  }
  60% {
    opacity: 1;
    transform: translateY(-32px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-56px) scale(0.95);
  }
}
.floating-damage {
  animation: float-up 1.4s ease-out forwards;
}
.drop-shadow-glow {
  filter: drop-shadow(0 0 8px rgba(255, 235, 0, 0.6));
}
@media (prefers-reduced-motion: reduce) {
  .floating-damage {
    animation: float-up 0.5s ease-out forwards;
  }
}
</style>
