<script setup lang="ts">
// /signup (Sprint 4.2) — web-native trainer creation. Lets a visitor
// without Claude Code create a full first-class account that can do
// everything a CLI-paired user can : edit profile, ladder PvE, live PvP,
// future wild zones (Sprint 4.5+).
//
// Flow :
//   1. Visitor picks one of 4 starters (one per Gen-1 lineage)
//   2. Optionally sets a display_name (else stays anonymous)
//   3. Submit → generates a random anon_id client-side, hits
//      POST /v1/arena/enable with origin='web'
//   4. Worker returns arena_secret ; we stash {anon_id, secret} in
//      localStorage via useArenaSession.set
//   5. Redirect to /profile so the user can immediately customize
//
// If already paired → redirect to /profile (no duplicate accounts).

import { useArenaSession } from '~/composables/useArenaSession'
import { LINEAGE_LABELS } from '~/utils/lineage'

const router = useRouter()
const api = useApi()
const { t } = useI18n()
const { isPaired, set } = useArenaSession()

onMounted(() => {
  if (isPaired.value) {
    void router.replace('/profile')
  }
})

type Starter = {
  lineage:
    | 'fire'
    | 'water'
    | 'grass'
    | 'electric'
    | 'eevee'
    | 'chikorita'
    | 'cyndaquil'
    | 'totodile'
  label: string
  emoji: string
  description: string
}

// MVP : the 4 canonical Gen-1 starters + Eevee for the 5th option. The
// Johto starters are accessible later via lineage transition events in
// the CLI's mechanic — we keep web signup focused for clarity.
const starters: Starter[] = [
  {
    lineage: 'fire',
    label: 'Salamèche',
    emoji: '🔥',
    description: 'Type Fire. Strong vs Grass, weak vs Water.',
  },
  {
    lineage: 'water',
    label: 'Carapuce',
    emoji: '💧',
    description: 'Type Water. Strong vs Fire, weak vs Grass + Electric.',
  },
  {
    lineage: 'grass',
    label: 'Bulbizarre',
    emoji: '🌿',
    description: 'Type Grass. Strong vs Water, weak vs Fire.',
  },
  {
    lineage: 'electric',
    label: 'Pichu',
    emoji: '⚡',
    description: 'Type Electric. Strong vs Water, weak vs Grass.',
  },
  {
    lineage: 'eevee',
    label: 'Évoli',
    emoji: '🦊',
    description: 'Type Normal. Evolves into 5 forms at Lv.30.',
  },
]

const selectedLineage = ref<Starter['lineage'] | null>(null)
const displayName = ref('')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

// Sprint 5 — recovery key modal. After /v1/arena/enable succeeds we display
// the anon_id + arena_secret ONCE so the user can save them as their only
// way to re-sign in if they clear localStorage. Redirect to /profile only
// after the user confirms they have saved the key.
const recoveryKey = ref<{ anonId: string; arenaSecret: string } | null>(null)
const copied = ref<'anonId' | 'secret' | 'combined' | null>(null)
const acknowledged = ref(false)

const combinedKey = computed(() =>
  recoveryKey.value ? `${recoveryKey.value.anonId}.${recoveryKey.value.arenaSecret}` : '',
)

async function copyToClipboard(text: string, slot: 'anonId' | 'secret' | 'combined') {
  try {
    await navigator.clipboard.writeText(text)
    copied.value = slot
    setTimeout(() => {
      if (copied.value === slot) copied.value = null
    }, 1800)
  } catch {
    // Clipboard refused (insecure context, no permission) — user can still
    // select + copy manually. Silent fail is acceptable here.
  }
}

function downloadRecoveryKey() {
  if (!recoveryKey.value) return
  const payload = {
    type: 'claude-pokemon-arena.recovery-key.v1',
    anon_id: recoveryKey.value.anonId,
    arena_secret: recoveryKey.value.arenaSecret,
    generated_at: new Date().toISOString(),
    note: 'Keep this file safe. It is the ONLY way to recover this account if you clear the browser.',
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `claude-pokemon-arena-${recoveryKey.value.anonId.slice(0, 8)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(a.href)
}

function continueAfterRecovery() {
  recoveryKey.value = null
  acknowledged.value = false
  copied.value = null
  void router.push('/profile')
}

const DISPLAY_NAME_RE = /^[a-zA-Z0-9_-]{2,24}$/

const displayNameValid = computed(() => {
  const v = displayName.value.trim()
  return v === '' || DISPLAY_NAME_RE.test(v)
})

// Generate a fresh anon_id client-side. The Worker accepts any
// 8-16 hex value matching ANON_ID_RE — we pick 16 for collision safety.
function generateAnonId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
}

async function signup() {
  if (!selectedLineage.value) {
    errorMsg.value = t('signup.error_pick_starter')
    return
  }
  if (!displayNameValid.value) {
    errorMsg.value = t('signup.error_displayname')
    return
  }
  submitting.value = true
  errorMsg.value = null
  try {
    const anonId = generateAnonId()
    const dn = displayName.value.trim() || null
    const res = await api.arenaEnable({
      anon_id: anonId,
      display_name: dn,
      lineage: selectedLineage.value,
      level: 1, // Web signup starts at Lv.1 ; future endpoints can level up.
      is_shiny: false,
      origin: 'web',
    })
    const stored = set({
      anon_id: anonId,
      arena_secret: res.arena_secret,
      paired_at: new Date().toISOString(),
    })
    if (!stored) {
      throw new Error('localStorage refused the session (private browsing ?)')
    }
    // Sprint 5 — show the recovery key modal BEFORE redirecting to /profile.
    // The arena_secret is returned exactly once by the worker ; if the user
    // ever clears localStorage they lose access for good unless they saved
    // it. We block the navigation behind an explicit "j'ai sauvé" checkbox.
    recoveryKey.value = { anonId, arenaSecret: res.arena_secret }
  } catch (e) {
    const status =
      (e as { statusCode?: number; response?: { status?: number } } | undefined)?.statusCode ??
      (e as { response?: { status?: number } } | undefined)?.response?.status
    if (status === 409) {
      errorMsg.value = t('signup.error_collision')
    } else {
      errorMsg.value = e instanceof Error ? e.message : t('signup.error_creation')
    }
  } finally {
    submitting.value = false
  }
}

useHead({
  title: () => `${t('signup.title')} · claude-pokemon arena`,
  meta: [{ name: 'description', content: () => t('signup.subtitle') }],
})
</script>

<template>
  <main class="max-w-2xl mx-auto px-6 py-12">
    <div class="mb-6">
      <NuxtLink to="/" class="text-secondary hover:text-primary text-sm transition">
        ← {{ t('common.back_home') }}
      </NuxtLink>
    </div>

    <header class="text-center mb-8">
      <h1
        class="text-3xl md:text-4xl font-bold text-primary flex items-center justify-center gap-3"
      >
        <PokeballIcon size="lg" />
        <span>{{ t('signup.title') }}</span>
      </h1>
      <p class="text-sm text-secondary mt-2 max-w-md mx-auto">
        {{ t('signup.subtitle') }}
      </p>
    </header>

    <section class="card p-6 mb-6">
      <h2 class="text-sm uppercase tracking-wider text-muted mb-4">
        {{ t('signup.section_starter') }}
      </h2>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <button
          v-for="s in starters"
          :key="s.lineage"
          type="button"
          class="flex flex-col items-center p-3 rounded-lg border transition"
          :class="
            selectedLineage === s.lineage
              ? 'surface-card-hover ring-2 ring-accent border-accent'
              : 'surface-card surface-border hover:surface-card-hover'
          "
          :title="s.description"
          @click="selectedLineage = s.lineage"
        >
          <PokemonSprite :lineage="s.lineage" :level="1" :is-shiny="false" size="md" animated />
          <div class="mt-2 text-xs font-bold text-primary">{{ s.label }}</div>
          <div class="text-[10px] text-muted text-center mt-0.5">
            {{ LINEAGE_LABELS[s.lineage] }}
          </div>
        </button>
      </div>
      <p v-if="selectedLineage" class="mt-4 text-xs text-secondary text-center">
        {{ starters.find(s => s.lineage === selectedLineage)?.description }}
      </p>
    </section>

    <section class="card p-6 mb-6">
      <h2 class="text-sm uppercase tracking-wider text-muted mb-4">
        {{ t('signup.section_displayname') }}
        <span class="text-muted">{{ t('signup.displayname_optional') }}</span>
      </h2>
      <input
        v-model="displayName"
        type="text"
        maxlength="24"
        :placeholder="t('signup.displayname_placeholder')"
        autocomplete="off"
        class="w-full px-3 py-2 rounded-md border surface-border surface-card text-primary"
        :class="!displayNameValid ? 'border-red-500' : ''"
      />
      <p class="text-xs text-muted mt-1">
        {{ t('signup.displayname_hint') }}
      </p>
    </section>

    <section
      class="surface-card border border-accent/30 rounded-lg p-4 mb-6 text-xs text-secondary"
    >
      <p>{{ t('signup.privacy_notice') }}</p>
    </section>

    <div class="flex flex-col items-center gap-3">
      <button
        type="button"
        class="px-8 py-3 bg-accent text-zinc-900 rounded-md font-bold hover:opacity-90 transition disabled:opacity-50"
        :disabled="submitting || !selectedLineage || !displayNameValid"
        @click="signup"
      >
        {{ submitting ? t('signup.submitting') : t('signup.submit') }}
      </button>
      <p v-if="errorMsg" class="text-sm text-red-400">⚠ {{ errorMsg }}</p>
      <div class="flex flex-col items-center gap-1 mt-2">
        <NuxtLink
          to="/login"
          class="text-xs text-secondary underline hover:text-primary transition"
        >
          {{ t('signup.have_account_login') }}
        </NuxtLink>
        <NuxtLink to="/pair" class="text-xs text-secondary underline hover:text-primary transition">
          {{ t('signup.have_account_pair') }}
        </NuxtLink>
      </div>
    </div>

    <!-- Sprint 5 — recovery key modal. Shown after a successful signup,
         blocks the redirect to /profile until the user confirms they have
         saved the anon_id + arena_secret. This is the user's ONLY way back
         in if they clear localStorage (no email, no password reset). -->
    <Teleport to="body">
      <div
        v-if="recoveryKey"
        class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-key-title"
      >
        <div class="card-elevated max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
          <h2
            id="recovery-key-title"
            class="text-xl font-bold text-primary flex items-center gap-2"
          >
            {{ t('signup.recovery_title') }}
          </h2>
          <p class="text-sm text-secondary mt-2">{{ t('signup.recovery_intro') }}</p>

          <div class="mt-4 space-y-3">
            <div>
              <label class="block text-xs font-bold text-muted uppercase tracking-wider mb-1">
                {{ t('signup.recovery_label_anonid') }}
              </label>
              <div class="flex gap-2">
                <code
                  class="flex-1 font-mono text-sm px-3 py-2 rounded-md surface-card border surface-border break-all"
                >
                  {{ recoveryKey.anonId }}
                </code>
                <button
                  type="button"
                  class="px-3 py-2 rounded-md border surface-border surface-card-hover text-xs transition"
                  @click="copyToClipboard(recoveryKey.anonId, 'anonId')"
                >
                  {{ copied === 'anonId' ? '✓' : '📋' }}
                </button>
              </div>
            </div>

            <div>
              <label class="block text-xs font-bold text-muted uppercase tracking-wider mb-1">
                {{ t('signup.recovery_label_secret') }}
              </label>
              <div class="flex gap-2">
                <code
                  class="flex-1 font-mono text-sm px-3 py-2 rounded-md surface-card border surface-border break-all"
                >
                  {{ recoveryKey.arenaSecret }}
                </code>
                <button
                  type="button"
                  class="px-3 py-2 rounded-md border surface-border surface-card-hover text-xs transition"
                  @click="copyToClipboard(recoveryKey.arenaSecret, 'secret')"
                >
                  {{ copied === 'secret' ? '✓' : '📋' }}
                </button>
              </div>
            </div>

            <div class="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                class="flex-1 px-4 py-2 rounded-md border surface-border surface-card-hover text-sm transition"
                @click="copyToClipboard(combinedKey, 'combined')"
              >
                {{
                  copied === 'combined'
                    ? '✓ ' + t('common.copied')
                    : '📋 ' + t('signup.recovery_copy_both')
                }}
              </button>
              <button
                type="button"
                class="flex-1 px-4 py-2 rounded-md border surface-border surface-card-hover text-sm transition"
                @click="downloadRecoveryKey"
              >
                ⬇ {{ t('signup.recovery_download') }}
              </button>
            </div>
          </div>

          <label
            class="flex items-start gap-2 mt-6 p-3 rounded-md surface-card border surface-border cursor-pointer"
          >
            <input v-model="acknowledged" type="checkbox" class="mt-0.5 flex-shrink-0" />
            <span class="text-sm text-primary">{{ t('signup.recovery_acknowledge') }}</span>
          </label>

          <button
            type="button"
            class="w-full mt-4 px-4 py-3 bg-accent text-zinc-900 rounded-md font-bold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="!acknowledged"
            @click="continueAfterRecovery"
          >
            {{ t('signup.recovery_continue') }}
          </button>
        </div>
      </div>
    </Teleport>
  </main>
</template>
