<script setup lang="ts">
// /login (Sprint 5) — recovery-key sign-in. The web signup model is anonymous
// (no email, no OAuth), so the only way back in after clearing localStorage
// is to paste the {anon_id, arena_secret} pair that was displayed once at
// signup. This page validates them via GET /v1/arena/whoami and persists the
// session on success.
//
// Three input modes :
//   1. Paste combined "anon_id.arena_secret" (the "copy both" button output)
//   2. Two separate fields (fallback if user only saved one piece)
//   3. Drop a .json file (the "download" button output)

import { useArenaSession } from '~/composables/useArenaSession'

const router = useRouter()
const api = useApi()
const { t } = useI18n()
const { isPaired, set } = useArenaSession()

onMounted(() => {
  if (isPaired.value) {
    void router.replace('/profile')
  }
})

const ANON_ID_RE = /^[a-f0-9]{8,16}$/
const ARENA_SECRET_RE = /^[a-f0-9]{32,64}$/

const anonId = ref('')
const arenaSecret = ref('')
const combinedInput = ref('')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

// When the user pastes the combined "anon_id.arena_secret" form, auto-split
// into the two fields so they can verify visually before submitting.
watch(combinedInput, v => {
  const trimmed = v.trim()
  if (!trimmed.includes('.')) return
  const [a, s] = trimmed.split('.', 2)
  if (a && ANON_ID_RE.test(a)) anonId.value = a
  if (s && ARENA_SECRET_RE.test(s)) arenaSecret.value = s
})

const formValid = computed(
  () => ANON_ID_RE.test(anonId.value.trim()) && ARENA_SECRET_RE.test(arenaSecret.value.trim()),
)

async function login() {
  if (!formValid.value) {
    errorMsg.value = t('login.error_format')
    return
  }
  submitting.value = true
  errorMsg.value = null
  try {
    const res = await api.arenaWhoami({
      anonId: anonId.value.trim(),
      arenaSecret: arenaSecret.value.trim(),
    })
    const stored = set({
      anon_id: res.anon_id,
      arena_secret: arenaSecret.value.trim(),
      paired_at: new Date().toISOString(),
    })
    if (!stored) {
      throw new Error('localStorage refused the session')
    }
    await router.push('/profile')
  } catch (e) {
    const status =
      (e as { statusCode?: number; response?: { status?: number } } | undefined)?.statusCode ??
      (e as { response?: { status?: number } } | undefined)?.response?.status
    if (status === 404) {
      errorMsg.value = t('login.error_not_found')
    } else if (status === 401) {
      errorMsg.value = t('login.error_invalid_secret')
    } else {
      errorMsg.value = e instanceof Error ? e.message : t('login.error_login')
    }
  } finally {
    submitting.value = false
  }
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result as string) as {
        anon_id?: unknown
        arena_secret?: unknown
      }
      if (typeof data.anon_id === 'string' && ANON_ID_RE.test(data.anon_id)) {
        anonId.value = data.anon_id
      }
      if (typeof data.arena_secret === 'string' && ARENA_SECRET_RE.test(data.arena_secret)) {
        arenaSecret.value = data.arena_secret
      }
      errorMsg.value = null
    } catch {
      errorMsg.value = t('login.error_file_unreadable')
    }
  }
  reader.readAsText(file)
}

useHead({
  title: () => `${t('login.title')} · claude-pokemon arena`,
  meta: [
    {
      name: 'description',
      content: () => t('login.subtitle'),
    },
  ],
})
</script>

<template>
  <main class="max-w-xl mx-auto px-6 py-12">
    <div class="mb-6">
      <NuxtLink to="/" class="text-secondary hover:text-primary text-sm transition">
        ← {{ t('common.back_home') }}
      </NuxtLink>
    </div>

    <header class="text-center mb-8">
      <h1 class="text-3xl font-bold text-primary flex items-center justify-center gap-2">
        🔑 <span>{{ t('login.title') }}</span>
      </h1>
      <p class="text-sm text-secondary mt-2 max-w-md mx-auto">
        {{ t('login.subtitle') }}
      </p>
    </header>

    <section class="card p-6 space-y-4">
      <div>
        <label class="block text-sm font-bold text-primary mb-1">
          {{ t('login.combined_label') }}
          <span class="text-muted font-normal">{{ t('login.combined_hint_form') }}</span>
        </label>
        <input
          v-model="combinedInput"
          type="text"
          autocomplete="off"
          spellcheck="false"
          :placeholder="t('login.combined_placeholder')"
          class="w-full px-3 py-2 rounded-md border surface-border surface-card text-primary font-mono text-sm"
        />
        <p class="text-xs text-muted mt-1">
          {{ t('login.combined_autofill_hint') }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-3">
        <div>
          <label class="block text-xs font-bold text-muted uppercase tracking-wider mb-1">
            anon_id
          </label>
          <input
            v-model="anonId"
            type="text"
            maxlength="16"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('login.anon_id_placeholder')"
            class="w-full px-3 py-2 rounded-md border surface-border surface-card text-primary font-mono text-sm"
          />
        </div>
        <div>
          <label class="block text-xs font-bold text-muted uppercase tracking-wider mb-1">
            arena_secret
          </label>
          <input
            v-model="arenaSecret"
            type="text"
            maxlength="64"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('login.secret_placeholder')"
            class="w-full px-3 py-2 rounded-md border surface-border surface-card text-primary font-mono text-sm"
          />
        </div>
      </div>

      <div class="flex items-center gap-2 text-xs text-muted">
        <span>{{ t('login.or') }}</span>
        <button
          type="button"
          class="underline hover:text-primary transition"
          @click="fileInput?.click()"
        >
          {{ t('login.import_json') }}
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="onFileChange"
        />
      </div>

      <button
        type="button"
        class="w-full px-4 py-3 bg-accent text-zinc-900 rounded-md font-bold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="submitting || !formValid"
        @click="login"
      >
        {{ submitting ? t('login.submitting') : t('login.submit') }}
      </button>

      <p v-if="errorMsg" class="text-sm text-red-400 text-center">⚠ {{ errorMsg }}</p>
    </section>

    <section class="surface-card border surface-border rounded-lg p-4 mt-6 text-xs text-secondary">
      <p class="mb-2">
        <strong>{{ t('login.lost_key_title') }}</strong> {{ t('login.lost_key_body') }}
      </p>
      <NuxtLink to="/signup" class="underline hover:text-primary transition">
        {{ t('login.lost_key_signup') }}
      </NuxtLink>
    </section>
  </main>
</template>
