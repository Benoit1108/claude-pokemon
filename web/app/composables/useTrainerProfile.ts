// Reactive trainer record for the currently paired browser session
// (Sprint 3.6). Fetches GET /v1/trainer/<anon_id> from the Worker once
// the user is paired, exposes it as `trainer` for UI consumers (header
// menu, /profile page).
//
// Cached at module level so multiple <UserMenu /> mounts share the same
// data without refetching. Call refresh() after a profile mutation
// (PATCH /v1/trainer/<id>/profile) to re-sync.

import type { TrainerResponse } from '~/types/api'

const trainer = ref<TrainerResponse | null>(null)
const fetching = ref(false)
const error = ref<string | null>(null)
let lastFetchedAnonId: string | null = null

export function useTrainerProfile() {
  const { session, isPaired } = useArenaSession()
  const api = useApi()

  async function refresh(): Promise<void> {
    if (!session.value) {
      trainer.value = null
      lastFetchedAnonId = null
      return
    }
    fetching.value = true
    error.value = null
    try {
      const res = await api.trainer(session.value.anon_id)
      trainer.value = res
      lastFetchedAnonId = session.value.anon_id
    } catch (e) {
      // 404 = trainer record doesn't exist (yet). Common right after a
      // fresh signup before the first submit lands. We surface null
      // instead of erroring so the UI degrades gracefully.
      const status =
        (e as { statusCode?: number; response?: { status?: number } } | undefined)?.statusCode ??
        (e as { response?: { status?: number } } | undefined)?.response?.status
      if (status === 404) {
        trainer.value = null
      } else {
        error.value = e instanceof Error ? e.message : 'Échec du chargement'
      }
    } finally {
      fetching.value = false
    }
  }

  // Auto-fetch when the paired anon_id changes (login / logout / re-pair).
  watch(
    () => session.value?.anon_id ?? null,
    newId => {
      if (newId && newId !== lastFetchedAnonId) {
        void refresh()
      } else if (!newId) {
        trainer.value = null
        lastFetchedAnonId = null
      }
    },
    { immediate: true },
  )

  return {
    trainer,
    fetching,
    error,
    isPaired,
    refresh,
  }
}
