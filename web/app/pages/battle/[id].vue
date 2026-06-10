<script setup lang="ts">
import { useBattlePlayer } from '~/composables/useBattlePlayer'
import { useSoundEffects } from '~/composables/useSoundEffects'
import { useBattleJuice } from '~/composables/useBattleJuice'
import { lineageGradient } from '~/utils/lineage'
import type { BattleResponse, BattleSide, BattleTurn, ReactionKey } from '~/types/api'

const route = useRoute()
const api = useApi()
const { t } = useI18n()

const battleId = computed(() => route.params.id as string)

const { data, error } = await useAsyncData<BattleResponse>(
  () => `battle-${battleId.value}`,
  () => api.arenaBattle(battleId.value),
)

if (error.value && import.meta.server) {
  setResponseStatus(404)
}

const battle = computed(() => data.value?.battle)
const turns: BattleTurn[] = data.value?.battle?.turns ?? []
const initialReactions: Record<ReactionKey, number> = {
  clap: 0,
  fire: 0,
  party: 0,
  lol: 0,
  tear: 0,
  love: 0,
  ...(data.value?.reactions ?? {}),
}

// Single-shot composable invocation — turns is captured at this moment
// (data is already fetched thanks to await useAsyncData above). Playback
// is auto-started; gracefully no-ops if turns is empty.
const player = useBattlePlayer(turns, { autoPlay: true, speed: 1 })
const sfx = useSoundEffects()

// Watch the player and trigger SFX. Each new revealed turn → hit / crit /
// super-effective. When the battle ends → win or defeat (challenger-centric
// for sound choice : page is read by anyone but the dramatic sound matches
// the visible winner banner).
watch(player.lastTurn, turn => {
  if (!turn) return
  if (turn.critical) sfx.playCritical()
  else if (turn.effectiveness >= 2) sfx.playSuperEffective()
  else sfx.playHit()
})

watch(player.isFinished, finished => {
  if (!finished || !battle.value) return
  if (battle.value.winner === 'draw') sfx.playDraw()
  else if (battle.value.winner === 'challenger') sfx.playWin()
  else sfx.playDefeat()
})

// Juice pack — confetti on winner = challenger, screen shake on crit,
// floating damage on every hit.
const finishedWinner = computed<BattleSide | 'draw' | null>(() =>
  player.isFinished.value ? (battle.value?.winner ?? null) : null,
)
const juice = useBattleJuice({
  lastTurn: player.lastTurn,
  isFinished: player.isFinished,
  winner: finishedWinner,
  cheerSide: 'challenger',
})

// Backdrop tinted by the winner's lineage (or challenger's if draw / mid-fight).
const backdropGradient = computed(() => {
  if (!battle.value) return 'none'
  const tintLineage =
    battle.value.winner === 'defender'
      ? battle.value.defender.lineage
      : battle.value.challenger.lineage
  return lineageGradient(tintLineage)
})

useHead({
  title: () =>
    battle.value
      ? t('battle.page_title_meta', { id: battleId.value.slice(0, 8) })
      : t('battle.page_title_not_found'),
  meta: [
    {
      name: 'description',
      content: t('battle.page_desc'),
    },
  ],
})
</script>

<template>
  <main
    :key="`shake-${juice.shakeKey.value}`"
    class="max-w-4xl mx-auto px-6 py-12 relative"
    :class="{ 'crit-shake': juice.shakeKey.value }"
    :style="{ background: backdropGradient }"
  >
    <div class="mb-6">
      <NuxtLink to="/arena" class="text-secondary hover:text-primary text-sm transition">
        {{ t('battle.back') }}
      </NuxtLink>
    </div>

    <div v-if="error" class="card p-12 text-center">
      <div class="text-6xl mb-4" aria-hidden="true">🥺</div>
      <h1 class="text-2xl font-bold text-primary mb-2">{{ t('battle.not_found_title') }}</h1>
      <p class="text-secondary">
        <i18n-t keypath="battle.not_found_body" tag="span">
          <template #id>
            <code class="text-accent">{{ battleId }}</code>
          </template>
        </i18n-t>
      </p>
      <p class="text-muted text-sm mt-4">
        {{ t('battle.not_found_expired') }}
      </p>
    </div>

    <template v-else-if="battle">
      <header class="text-center mb-8">
        <div class="text-xs uppercase tracking-widest text-secondary mb-1">
          {{ t('battle.header_eyebrow') }}
        </div>
        <h1 class="text-3xl font-bold text-primary">{{ t('battle.header_title') }}</h1>
        <p class="text-muted text-sm mt-2">
          <time :datetime="battle.created_at">{{
            battle.created_at.slice(0, 16).replace('T', ' ')
          }}</time>
          · {{ t('battle.seed_label') }}
          <code class="text-secondary">{{ battle.seed }}</code>
        </p>
      </header>

      <BattleStage
        scene="arena"
        :challenger="battle.challenger"
        :defender="battle.defender"
        :winner="battle.winner"
        :current-turn="player.lastTurn.value"
        :visible-turns="player.visibleTurns.value"
        :show-final-state="player.isFinished.value"
        :floating-damages="juice.floatingDamages.value"
      />

      <BattleControls
        :is-playing="player.isPlaying.value"
        :is-finished="player.isFinished.value"
        :speed="player.speed.value"
        :progress="player.progress.value"
        :current-turn-idx="player.currentTurnIdx.value"
        :total-turns="player.totalTurns"
        :sound-theme="sfx.theme.value"
        @toggle="player.toggle()"
        @skip-to-end="player.skipToEnd()"
        @restart="player.restart()"
        @set-speed="s => player.setSpeed(s)"
        @toggle-sound="sfx.cycleSound()"
      />

      <BattleResultBanner
        v-if="player.isFinished.value"
        :winner="battle.winner"
        :reason="battle.reason"
        :challenger="battle.challenger"
        :defender="battle.defender"
        :total-turns="turns.length"
      />

      <ReactionBar
        v-if="player.isFinished.value"
        :battle-id="battleId"
        :initial-counts="initialReactions"
      />

      <BattleLog
        :turns="player.visibleTurns.value"
        :challenger="battle.challenger"
        :defender="battle.defender"
      />

      <footer class="text-center text-muted text-sm mt-12 pt-8 border-t surface-border">
        <p>
          {{ t('battle.footer_deterministic') }}
        </p>
      </footer>
    </template>
  </main>
</template>
