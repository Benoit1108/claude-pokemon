<script setup lang="ts">
// Sprint 5 — global user menu lives in AppHeader's right cluster.
// Two states :
//   1. NOT PAIRED — small "Se connecter" pill, dropdown offers signup OR pair
//   2. PAIRED — tight pill : 22px Pokéball-ringed sprite avatar + display_name
//      + chevron. Dropdown right-aligned, offers profile / trainer card /
//      arena / ladder / zones / pair / retro theme toggle / unpair.
//
// Mockup reference : docs/mockups/sprint-5/01-header.html (user pill).
// The dropdown opens right-aligned because the trigger sits in the header's
// right cluster — opening left would overflow on mobile.
//
// Sprint 5 — the segmented theme toggle (light/dark/system) is now in the
// AppHeader. Retro mode is reachable here, in the dropdown.

import { useArenaSession } from '~/composables/useArenaSession'
import { useTrainerProfile } from '~/composables/useTrainerProfile'
import { lineageLabel, lineageAccent, lineageEmoji } from '~/utils/lineage'

const { t } = useI18n()
const { session, isPaired, clear } = useArenaSession()
const { trainer } = useTrainerProfile()
const colorMode = useColorMode()

const open = ref(false)
const menuRef = ref<HTMLElement | null>(null)
// Sprint 5 — recovery key warning before unpairing. The arena_secret is only
// shown once at signup. If the user clears localStorage without having saved
// it, the account is permanently inaccessible (no email reset). We block the
// destructive button behind a small confirmation panel.
const showUnpairConfirm = ref(false)

const displayName = computed(() => {
  if (trainer.value?.display_name) return trainer.value.display_name
  if (session.value) return session.value.anon_id.slice(0, 8)
  return ''
})

const lineage = computed(() => trainer.value?.stats.active.lineage ?? null)
const level = computed(() => trainer.value?.stats.active.current_level ?? 0)
const isShiny = computed(() => trainer.value?.stats.active.is_shiny ?? false)
const accent = computed(() => lineageAccent(lineage.value))
const retroActive = computed(() => colorMode.preference === 'retro')

const router = useRouter()

function unpair(): void {
  clear()
  open.value = false
  showUnpairConfirm.value = false
  void router.push('/')
}

function requestUnpair(): void {
  showUnpairConfirm.value = true
}
function cancelUnpair(): void {
  showUnpairConfirm.value = false
}

function goTo(path: string): void {
  open.value = false
  void router.push(path)
}

function toggleRetro(): void {
  // Retro stays accessible from this menu (not from the segmented control,
  // which is light/dark/system only). Toggling out of retro returns to
  // 'system' so the user lands on their OS preference.
  colorMode.preference = retroActive.value ? 'system' : 'retro'
  open.value = false
}

function onDocClick(e: MouseEvent): void {
  if (!menuRef.value) return
  if (!menuRef.value.contains(e.target as Node)) open.value = false
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') open.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('keydown', onKey)
})
</script>

<template>
  <ClientOnly>
    <div ref="menuRef" class="relative">
      <!-- NOT PAIRED — pill with dropdown for signup vs pair. -->
      <div v-if="!isPaired">
        <button
          type="button"
          class="pill pill-interactive"
          :title="t('user_menu.connect_title')"
          @click="open = !open"
        >
          <PokeballIcon size="xs" />
          <span class="hidden sm:inline">{{ t('user_menu.connect') }}</span>
          <span class="transition-transform" :class="open ? 'rotate-180' : ''" aria-hidden="true"
            >▾</span
          >
        </button>
        <Transition name="menu-fade">
          <div
            v-if="open"
            class="absolute right-0 mt-2 w-64 card-elevated rounded-lg py-1 z-50"
            role="menu"
          >
            <NuxtLink
              to="/signup"
              class="block px-3 py-2 text-sm surface-card-hover text-primary transition-default"
              role="menuitem"
              @click="open = false"
            >
              <div class="font-bold">{{ t('user_menu.signup_title') }}</div>
              <div class="text-xs text-muted">{{ t('user_menu.signup_subtitle') }}</div>
            </NuxtLink>
            <NuxtLink
              to="/login"
              class="block px-3 py-2 text-sm surface-card-hover text-primary transition-default border-t surface-border"
              role="menuitem"
              @click="open = false"
            >
              <div class="font-bold">{{ t('user_menu.login_title') }}</div>
              <div class="text-xs text-muted">{{ t('user_menu.login_subtitle') }}</div>
            </NuxtLink>
            <NuxtLink
              to="/pair"
              class="block px-3 py-2 text-sm surface-card-hover text-primary transition-default border-t surface-border"
              role="menuitem"
              @click="open = false"
            >
              <div class="font-bold">{{ t('user_menu.pair_title') }}</div>
              <div class="text-xs text-muted">{{ t('user_menu.pair_subtitle') }}</div>
            </NuxtLink>
          </div>
        </Transition>
      </div>

      <!-- PAIRED — avatar + display_name + chevron. -->
      <button
        v-else
        type="button"
        class="user-pill"
        :title="t('user_menu.connected_as', { name: displayName })"
        @click="open = !open"
      >
        <span
          class="user-avatar"
          :style="lineage ? { borderColor: accent, boxShadow: `0 0 10px ${accent}40` } : {}"
        >
          <PokemonSprite
            v-if="lineage"
            :lineage="lineage"
            :level="level"
            :is-shiny="isShiny"
            size="xs"
          />
          <PokeballIcon v-else size="xs" />
        </span>
        <span class="user-name hidden sm:inline">{{ displayName }}</span>
        <span
          class="text-tertiary transition-transform text-xs"
          :class="open ? 'rotate-180' : ''"
          aria-hidden="true"
          >▾</span
        >
      </button>

      <!-- Dropdown for paired users -->
      <Transition name="menu-fade">
        <div
          v-if="isPaired && open"
          class="absolute right-0 mt-2 w-72 card-elevated rounded-lg py-1 z-50"
          role="menu"
        >
          <div class="px-3 py-2 border-b surface-border">
            <div class="text-caption">{{ t('user_menu.connected') }}</div>
            <div class="font-display font-bold text-primary truncate text-base mt-0.5">
              {{ displayName }}
            </div>
            <div class="text-xs text-secondary mt-1">
              <code class="font-mono text-muted">{{ session?.anon_id }}</code>
            </div>
            <div v-if="lineage" class="text-xs text-secondary mt-1">
              {{ lineageEmoji(lineage) }} {{ lineageLabel(lineage) }} ·
              {{ level === 0 ? '🥚 Egg' : `Lv.${level}` }}
              <span v-if="isShiny" class="text-accent">✦</span>
            </div>
          </div>

          <button type="button" class="menu-item" role="menuitem" @click="goTo('/profile')">
            <SectionIcon name="profile" :size="16" />
            {{ t('user_menu.menu_profile') }}
          </button>
          <button
            v-if="session"
            type="button"
            class="menu-item"
            role="menuitem"
            @click="goTo(`/trainer/${session.anon_id}`)"
          >
            <span class="w-4 inline-flex justify-center" aria-hidden="true">🪪</span>
            {{ t('user_menu.menu_trainer_card') }}
          </button>
          <button type="button" class="menu-item" role="menuitem" @click="goTo('/pair')">
            <span class="w-4 inline-flex justify-center" aria-hidden="true">🔗</span>
            {{ t('user_menu.menu_pair_manage') }}
          </button>

          <div class="border-t surface-border my-1" />

          <!-- Retro theme toggle — niche flavor that doesn't fit the
               3-state segmented control. Click toggles in/out. -->
          <button
            type="button"
            class="menu-item"
            role="menuitemcheckbox"
            :aria-checked="retroActive"
            @click="toggleRetro"
          >
            <span class="w-4 inline-flex justify-center" aria-hidden="true">🎮</span>
            {{ t('user_menu.menu_retro') }}
            <span v-if="retroActive" class="ml-auto text-accent" aria-hidden="true">✓</span>
          </button>

          <div class="border-t surface-border my-1" />

          <div
            v-if="showUnpairConfirm"
            class="px-3 py-3 surface-card border-t border-b surface-border"
          >
            <p class="text-xs text-primary mb-2">
              <strong>{{ t('user_menu.unpair_confirm_title') }}</strong>
            </p>
            <p class="text-xs text-secondary mb-3">
              {{ t('user_menu.unpair_confirm_body') }}
            </p>
            <div class="flex gap-2">
              <button
                type="button"
                class="flex-1 px-2 py-1.5 text-xs rounded-md border surface-border surface-card-hover transition"
                @click="cancelUnpair"
              >
                {{ t('common.cancel') }}
              </button>
              <button
                type="button"
                class="flex-1 px-2 py-1.5 text-xs rounded-md bg-red-500/10 text-red-500 border border-red-500/30 hover:bg-red-500/20 transition"
                @click="unpair"
              >
                {{ t('user_menu.unpair_confirm_yes') }}
              </button>
            </div>
          </div>
          <button
            v-else
            type="button"
            class="menu-item menu-item-danger"
            role="menuitem"
            @click="requestUnpair"
          >
            <span class="w-4 inline-flex justify-center" aria-hidden="true">🚪</span>
            {{ t('user_menu.menu_disconnect') }}
          </button>
        </div>
      </Transition>
    </div>
  </ClientOnly>
</template>

<style scoped>
/* User pill (paired state). Uses tokens.css equivalents from uno.config.ts
 * but defined here for the precise sub-pixel paddings around the avatar. */
.user-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.625rem 0.25rem 0.25rem;
  background: var(--surface-elevated, transparent);
  border: 1px solid currentColor;
  border-color: rgb(228 228 231); /* zinc-200 */
  border-radius: 9999px;
  color: inherit;
  cursor: pointer;
  transition:
    border-color 200ms cubic-bezier(0.16, 1, 0.3, 1),
    background-color 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
:global(html.dark .user-pill) {
  border-color: rgb(48 54 61);
  background-color: rgb(28 33 40);
}
.user-pill:hover {
  border-color: rgb(212 160 23 / 0.5);
}
:global(html.dark .user-pill:hover) {
  border-color: rgb(255 215 0 / 0.5);
  background-color: rgb(22 27 34);
}
.user-avatar {
  position: relative;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--surface-card, #fff);
  flex-shrink: 0;
  box-sizing: content-box;
}
:global(html.dark .user-avatar) {
  background: rgb(22 27 34);
}
.user-name {
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: -0.005em;
  max-width: 8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Dropdown menu items. Consistent left padding so the icon column stays
 * aligned regardless of label length. */
.menu-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  color: inherit;
  background: transparent;
  border: 0;
  text-align: left;
  cursor: pointer;
  transition: background-color 200ms cubic-bezier(0.16, 1, 0.3, 1);
}
.menu-item:hover {
  background: rgb(244 244 245);
}
:global(html.dark .menu-item:hover) {
  background: rgb(33 38 45);
}
.menu-item-danger {
  color: rgb(220 38 38);
}
:global(html.dark .menu-item-danger) {
  color: rgb(239 68 68);
}
.menu-item-danger:hover {
  background: rgb(239 68 68 / 0.08);
}

.menu-fade-enter-active,
.menu-fade-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}
.menu-fade-enter-from,
.menu-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
