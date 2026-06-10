<script setup lang="ts">
// Bounded emoji reactions on the post-finish battle page (Sprint 2.8b).
// 6 buttons : 👏 🔥 🎉 😂 🥲 ❤️ — sized to fit one row on desktop, wraps
// on mobile. Each shows aggregated count. Click sends POST + optimistic
// local update + server sync.
//
// User identity for rate-limit : a randomly generated anon_id stored in
// localStorage. This is SEPARATE from the CLI's anon_id (we don't have
// access to it without a sync flow — Sprint 2.12 will add QR-code login).

import type { ReactionKey } from '~/types/api'

const props = defineProps<{
  battleId: string
  /** Initial counts from the battle endpoint (server-truth). */
  initialCounts: Record<ReactionKey, number>
}>()

const { t } = useI18n()

const REACTIONS = computed<{ key: ReactionKey; emoji: string; label: string }[]>(() => [
  { key: 'clap', emoji: '👏', label: t('reactions.label_clap') },
  { key: 'fire', emoji: '🔥', label: t('reactions.label_fire') },
  { key: 'party', emoji: '🎉', label: t('reactions.label_party') },
  { key: 'lol', emoji: '😂', label: t('reactions.label_lol') },
  { key: 'tear', emoji: '🥲', label: t('reactions.label_tear') },
  { key: 'love', emoji: '❤️', label: t('reactions.label_love') },
])

const counts = ref<Record<ReactionKey, number>>({ ...props.initialCounts })
const myReaction = ref<ReactionKey | null>(null)
const submitting = ref(false)
const error = ref<string | null>(null)

// Sprint 2.13 (Q9) — renamed from "anon-id" to "reactor-id" to break the
// confusion with the CLI's anon_id (which is a real trainer identifier with
// arena_secret + stats). The reactor_id is a per-browser ephemeral pseudo-ID
// used solely to rate-limit reactions ; it has no privileges and is NOT the
// same identifier as the CLI's. Worker-side, /react still expects the field
// name `anon_id` in the body — we just send the reactor_id under that name
// (the worker never correlates it with stats).
const REACTOR_KEY = 'arena-reactor-id'
const VOTE_KEY_PREFIX = 'arena-reaction-vote:'

function getOrCreateReactorId(): string {
  if (typeof localStorage === 'undefined') return '00000000'
  let id = localStorage.getItem(REACTOR_KEY)
  // Migration : pick up the old key if the new one isn't set yet.
  if (!id) {
    const legacy = localStorage.getItem('arena-reaction-anon-id')
    if (legacy) {
      id = legacy
      try {
        localStorage.setItem(REACTOR_KEY, id)
      } catch {
        /* ignore */
      }
    }
  }
  if (!id || !/^[a-f0-9]{8,16}$/.test(id)) {
    // 8 hex chars from crypto.getRandomValues — same shape as the CLI anon_id
    // contract so the worker accepts it (the worker doesn't care which side
    // generated it, only the regex).
    const bytes = new Uint8Array(4)
    crypto.getRandomValues(bytes)
    id = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('')
    try {
      localStorage.setItem(REACTOR_KEY, id)
    } catch {
      /* ignore */
    }
  }
  return id
}

onMounted(() => {
  // Restore the previous vote for THIS battle (if any) so the highlighted
  // emoji persists across reloads.
  try {
    const stored = localStorage.getItem(VOTE_KEY_PREFIX + props.battleId)
    if (stored && REACTIONS.value.find(r => r.key === stored) !== undefined) {
      myReaction.value = stored as ReactionKey
    }
  } catch {
    /* ignore */
  }
})

const config = useRuntimeConfig()

async function react(reaction: ReactionKey) {
  if (submitting.value) return
  // Optimistic update : decrement old, increment new locally, then POST.
  const previous = myReaction.value
  if (previous === reaction) return // no-op
  if (previous && counts.value[previous] > 0) counts.value[previous]--
  counts.value[reaction] = (counts.value[reaction] ?? 0) + 1
  myReaction.value = reaction
  try {
    localStorage.setItem(VOTE_KEY_PREFIX + props.battleId, reaction)
  } catch {
    /* ignore */
  }

  submitting.value = true
  error.value = null
  try {
    const res = await $fetch<{ ok: boolean; reactions: Record<ReactionKey, number> }>(
      `${config.public.apiBase}/v1/arena/battle/${props.battleId}/react`,
      {
        method: 'POST',
        body: { anon_id: getOrCreateReactorId(), reaction },
      },
    )
    // Sync to server-truth (in case other people reacted simultaneously).
    if (res?.reactions) counts.value = { ...counts.value, ...res.reactions }
  } catch (e) {
    // Revert optimistic state on failure.
    if (previous) {
      counts.value[reaction] = Math.max(0, (counts.value[reaction] ?? 0) - 1)
      counts.value[previous] = (counts.value[previous] ?? 0) + 1
      myReaction.value = previous
    } else {
      counts.value[reaction] = Math.max(0, (counts.value[reaction] ?? 0) - 1)
      myReaction.value = null
    }
    error.value = e instanceof Error ? e.message : t('reactions.err_network')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="card p-4 mb-6">
    <div class="text-xs uppercase tracking-widest text-secondary mb-3 text-center">
      {{ t('reactions.title') }}
    </div>
    <div class="flex flex-wrap justify-center gap-2">
      <button
        v-for="r in REACTIONS"
        :key="r.key"
        type="button"
        :title="r.label"
        :disabled="submitting"
        class="px-3 py-2 border surface-border rounded-md transition flex items-center gap-1.5 disabled:opacity-60"
        :class="
          myReaction === r.key
            ? 'bg-accent text-zinc-900 border-accent font-bold'
            : 'surface-card-hover text-primary'
        "
        @click="react(r.key)"
      >
        <span class="text-lg">{{ r.emoji }}</span>
        <span class="tabular-nums text-sm">{{ counts[r.key] || 0 }}</span>
      </button>
    </div>
    <p v-if="error" class="text-xs text-red-400 mt-2 text-center">⚠ {{ error }}</p>
  </div>
</template>
