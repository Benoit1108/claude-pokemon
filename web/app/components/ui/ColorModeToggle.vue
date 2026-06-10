<script setup lang="ts">
// Sprint 5 — 3-state segmented theme toggle. Replaces the cycling icon
// button. Layout : ☀ light / 🌙 dark / 🖥 system aligned in a pill, the
// selected option has a thumb that slides under it (spring easing).
//
// The 4th mode ("retro" — GameBoy DMG palette) is intentionally NOT in this
// control : it's a niche flavor that lives in the UserMenu dropdown.

const colorMode = useColorMode()
const { t } = useI18n()

type Mode = 'light' | 'dark' | 'system'
const options = computed<{ value: Mode; icon: string; label: string }[]>(() => [
  { value: 'light', icon: '☀', label: t('theme.label_light') },
  { value: 'dark', icon: '🌙', label: t('theme.label_dark') },
  { value: 'system', icon: '🖥', label: t('theme.label_system') },
])

const groupRef = ref<HTMLElement | null>(null)
const thumbStyle = ref<{ width: string; transform: string }>({
  width: '0px',
  transform: 'translateX(0px)',
})

// Picks the currently-selected segment. If the user has retro on, none of
// the 3 segments are highlighted (retro is owned by UserMenu). The thumb
// collapses to width 0 in that case.
const current = computed<Mode | null>(() => {
  const pref = colorMode.preference
  if (pref === 'light' || pref === 'dark' || pref === 'system') return pref
  return null
})

function moveThumb(): void {
  const group = groupRef.value
  if (!group || !current.value) {
    thumbStyle.value = { width: '0px', transform: 'translateX(0px)' }
    return
  }
  const selected = group.querySelector<HTMLElement>(`[data-theme-value="${current.value}"]`)
  if (!selected) return
  thumbStyle.value = {
    width: `${selected.offsetWidth}px`,
    transform: `translateX(${selected.offsetLeft}px)`,
  }
}

function pick(mode: Mode): void {
  colorMode.preference = mode
}

onMounted(() => {
  moveThumb()
  // Re-align once the webfont swaps in (segment widths may shift).
  if (document.fonts && document.fonts.ready) {
    void document.fonts.ready.then(moveThumb)
  }
  window.addEventListener('resize', moveThumb)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', moveThumb)
})
watch(current, () => {
  // nextTick so the DOM reflects the new aria-pressed before we measure.
  void nextTick(moveThumb)
})
</script>

<template>
  <ClientOnly>
    <div
      ref="groupRef"
      class="theme-toggle relative inline-flex items-center p-[3px] rounded-full border surface-border surface-elevated h-8"
      role="radiogroup"
      :aria-label="t('theme.aria_group')"
    >
      <span
        class="theme-thumb absolute top-[3px] bottom-[3px] left-0 surface-card rounded-full shadow-sm transition-spring"
        :style="thumbStyle"
        aria-hidden="true"
      />
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        :data-theme-value="opt.value"
        :aria-pressed="current === opt.value"
        :aria-label="`${t('theme.title_prefix')} ${opt.label}`"
        :title="`${t('theme.title_prefix')} ${opt.label}`"
        class="theme-option relative z-1 inline-flex items-center justify-center min-w-[30px] h-[26px] px-1.5 text-[13px] bg-transparent border-0 rounded-full transition-default cursor-pointer"
        :class="current === opt.value ? 'text-primary' : 'text-tertiary hover:text-secondary'"
        @click="pick(opt.value)"
      >
        <span aria-hidden="true">{{ opt.icon }}</span>
      </button>
    </div>
  </ClientOnly>
</template>

<style scoped>
/* The thumb's animated transform sits below the buttons via z-index, so the
 * buttons stay clickable and the icons read on top of the moving pill. */
.theme-thumb {
  z-index: 0;
}
</style>
