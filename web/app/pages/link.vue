<script setup lang="ts">
// /link (R2 — phase B) — link your CLI account to your GitHub login.
// Requires a GitHub session ; proves ownership of the CLI account via the
// arena_secret (POST /v1/auth/link-anon). On success we also persist the arena
// session locally so /profile (which keys on anon_id) immediately works.

import { useAuthSession } from '~/composables/useAuthSession'
import { useArenaSession } from '~/composables/useArenaSession'

const router = useRouter()
const api = useApi()
const { t } = useI18n()
const { isAuthenticated, sessionToken, user } = useAuthSession()
const { isPaired, set } = useArenaSession()

const ANON_ID_RE = /^[a-f0-9]{8,16}$/
const ARENA_SECRET_RE = /^[a-f0-9]{32,64}$/

const anonId = ref('')
const arenaSecret = ref('')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)

onMounted(() => {
  if (!isAuthenticated.value) {
    void router.replace('/login')
  } else if (isPaired.value) {
    void router.replace('/profile')
  }
})

const formValid = computed(
  () => ANON_ID_RE.test(anonId.value.trim()) && ARENA_SECRET_RE.test(arenaSecret.value.trim()),
)

async function link(): Promise<void> {
  if (!formValid.value || !sessionToken.value) {
    errorMsg.value = t('auth.link.err_format')
    return
  }
  submitting.value = true
  errorMsg.value = null
  try {
    await api.linkAnon({
      sessionToken: sessionToken.value,
      anonId: anonId.value.trim(),
      arenaSecret: arenaSecret.value.trim(),
    })
    // Linking proved ownership ; persist the arena session so /profile works.
    set({
      anon_id: anonId.value.trim(),
      arena_secret: arenaSecret.value.trim(),
      paired_at: new Date().toISOString(),
    })
    await router.push('/profile')
  } catch (e) {
    const status =
      (e as { statusCode?: number; response?: { status?: number } } | undefined)?.statusCode ??
      (e as { response?: { status?: number } } | undefined)?.response?.status
    if (status === 409) errorMsg.value = t('auth.link.err_already_linked')
    else if (status === 401) errorMsg.value = t('auth.link.err_invalid_secret')
    else if (status === 404) errorMsg.value = t('auth.link.err_not_found')
    else errorMsg.value = e instanceof Error ? e.message : t('auth.link.err_generic')
  } finally {
    submitting.value = false
  }
}

useHead({ title: () => `${t('auth.link.title')} · claude-pokemon arena` })
</script>

<template>
  <main class="max-w-xl mx-auto px-6 py-12">
    <div class="mb-6">
      <NuxtLink to="/" class="text-secondary hover:text-primary text-sm transition">
        ← {{ t('common.back_home') }}
      </NuxtLink>
    </div>

    <header class="text-center mb-8">
      <h1 class="text-3xl font-bold text-primary">🔗 {{ t('auth.link.title') }}</h1>
      <p class="text-sm text-secondary mt-2 max-w-md mx-auto">{{ t('auth.link.subtitle') }}</p>
      <p v-if="user?.github" class="text-xs text-muted mt-1">@{{ user.github.login }}</p>
    </header>

    <section class="card p-6 space-y-4">
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
          :placeholder="t('auth.link.anon_id_placeholder')"
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
          :placeholder="t('auth.link.secret_placeholder')"
          class="w-full px-3 py-2 rounded-md border surface-border surface-card text-primary font-mono text-sm"
        />
      </div>

      <p v-if="errorMsg" class="text-sm text-red-400">⚠ {{ errorMsg }}</p>

      <button
        type="button"
        class="w-full px-4 py-3 bg-accent text-zinc-900 rounded-md font-bold hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="submitting || !formValid"
        @click="link"
      >
        {{ submitting ? t('auth.link.submitting') : t('auth.link.submit') }}
      </button>

      <p class="text-xs text-muted">{{ t('auth.link.hint') }}</p>
    </section>
  </main>
</template>
