<script setup lang="ts">
// /auth/github/callback — GitHub redirects here with ?code & ?state (or ?error).
// We verify state + hand the code to the Worker via useAuthSession, then bounce
// to /profile. All work is client-side (the token never transits the SSR HTML).
import { useAuthSession } from '~/composables/useAuthSession'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const { completeGithubCallback } = useAuthSession()

const status = ref<'working' | 'error'>('working')
const errorKey = ref('auth.callback.error_generic')

onMounted(async () => {
  const code = typeof route.query.code === 'string' ? route.query.code : ''
  const state = typeof route.query.state === 'string' ? route.query.state : ''
  if (route.query.error || !code || !state) {
    status.value = 'error'
    errorKey.value = route.query.error
      ? 'auth.callback.error_denied'
      : 'auth.callback.error_missing'
    return
  }
  try {
    await completeGithubCallback(code, state)
    await router.replace('/profile')
  } catch (e) {
    status.value = 'error'
    errorKey.value =
      (e as Error)?.message === 'state_mismatch'
        ? 'auth.callback.error_state'
        : 'auth.callback.error_generic'
  }
})
</script>

<template>
  <main class="mx-auto max-w-md px-4 py-16 text-center">
    <div v-if="status === 'working'" class="card p-8">
      <p class="text-lg">{{ t('auth.callback.working') }}</p>
    </div>
    <div v-else class="card p-8 space-y-4">
      <p class="text-lg">{{ t(errorKey) }}</p>
      <NuxtLink to="/login" class="btn-primary inline-block">
        {{ t('auth.callback.back_to_login') }}
      </NuxtLink>
    </div>
  </main>
</template>
