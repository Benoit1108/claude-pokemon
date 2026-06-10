<script setup lang="ts">
// Redeem a CLI-issued pairing code (Sprint 2.12). The page reads ?code= from
// the URL on mount, POSTs to /v1/arena/pair/redeem, and stores the returned
// {anon_id, arena_secret} in localStorage via useArenaSession. Once paired,
// the live battle page becomes interactive (move picker enabled).

const route = useRoute()
const router = useRouter()
const api = useApi()
const { t } = useI18n()
const { session, isPaired, set, clear } = useArenaSession()

const queryCode = computed(() => {
  const c = route.query.code
  return typeof c === 'string' ? c.toUpperCase().trim() : ''
})

const codeInput = ref('')
const status = ref<'idle' | 'redeeming' | 'paired' | 'error'>('idle')
const errorMsg = ref<string | null>(null)

const CODE_RE = /^[A-HJ-NP-TV-Z2-9]{6}$/

async function redeem(code: string) {
  if (!CODE_RE.test(code)) {
    status.value = 'error'
    errorMsg.value = t('pair.invalid_code')
    return
  }
  status.value = 'redeeming'
  errorMsg.value = null
  try {
    const res = await api.arenaPairRedeem(code)
    const stored = set({
      anon_id: res.anon_id,
      arena_secret: res.arena_secret,
      paired_at: new Date().toISOString(),
    })
    if (!stored) {
      status.value = 'error'
      errorMsg.value = t('pair.invalid_response')
      return
    }
    status.value = 'paired'
  } catch (e) {
    status.value = 'error'
    errorMsg.value = e instanceof Error ? e.message : t('pair.redeem_failed')
  }
}

onMounted(() => {
  // Auto-redeem if a code is in the URL.
  if (queryCode.value && !isPaired.value) {
    void redeem(queryCode.value)
  }
})

function submitManual() {
  void redeem(codeInput.value.toUpperCase().trim())
}

function unpair() {
  clear()
  status.value = 'idle'
  errorMsg.value = null
  // Clean ?code= from the URL so a refresh doesn't re-pair on the same code
  // (which will 404 anyway, but keeps the page coherent).
  void router.replace({ path: '/pair' })
}

useHead({
  title: () => `${t('pair.title')} · claude-pokemon arena`,
  meta: [{ name: 'description', content: () => t('pair.subtitle') }],
})
</script>

<template>
  <main class="max-w-xl mx-auto px-6 py-12">
    <div class="mb-6">
      <NuxtLink to="/arena" class="text-secondary hover:text-primary text-sm transition">
        ← {{ t('pair.back_arena') }}
      </NuxtLink>
    </div>

    <header class="text-center mb-8">
      <h1 class="text-3xl font-bold text-primary">{{ t('pair.title') }}</h1>
      <p class="text-muted text-sm mt-2">{{ t('pair.subtitle') }}</p>
    </header>

    <div v-if="isPaired" class="card p-6 text-center">
      <div class="text-4xl mb-2" aria-hidden="true">✓</div>
      <p class="text-lg font-semibold text-primary">{{ t('pair.paired_title') }}</p>
      <p class="text-sm text-secondary mt-1">
        {{ t('pair.paired_trainer') }}
        <code class="text-accent">{{ session?.anon_id.slice(0, 8) }}</code>
        · {{ t('pair.paired_at') }}
        <time :datetime="session?.paired_at">{{
          new Date(session?.paired_at ?? '').toLocaleString()
        }}</time>
      </p>
      <button
        type="button"
        class="mt-4 px-4 py-2 border surface-border rounded-md surface-card-hover text-sm transition"
        @click="unpair"
      >
        {{ t('pair.disconnect') }}
      </button>
    </div>

    <div v-else-if="status === 'redeeming'" class="card p-6 text-center">
      <div class="text-3xl mb-2" aria-hidden="true">⏳</div>
      <p class="text-secondary">{{ t('pair.redeeming') }}</p>
    </div>

    <div v-else class="space-y-4">
      <div class="card p-6">
        <p class="text-sm text-secondary mb-4">{{ t('pair.step1') }}</p>
        <p class="text-sm text-secondary mb-4">{{ t('pair.step2') }}</p>
        <div class="flex flex-col sm:flex-row gap-2">
          <input
            v-model="codeInput"
            type="text"
            maxlength="6"
            :placeholder="t('pair.code_placeholder')"
            autocomplete="off"
            spellcheck="false"
            class="flex-1 px-4 py-2 rounded-md border surface-border surface-card text-primary tracking-[0.3em] font-mono text-center uppercase"
          />
          <button
            type="button"
            class="px-4 py-2 bg-accent text-zinc-900 rounded-md font-bold hover:opacity-90 transition"
            @click="submitManual"
          >
            {{ t('pair.submit') }}
          </button>
        </div>
      </div>

      <p v-if="status === 'error'" class="text-center text-red-400 text-sm">⚠ {{ errorMsg }}</p>

      <div class="card p-4 text-xs text-muted">{{ t('pair.secret_notice') }}</div>
    </div>
  </main>
</template>
